-- ============================================================
-- avansa · seguridad por asesor, reparto justo y formulario web
-- ============================================================
-- Esta migración convierte el CRM en un sistema de dos perfiles operativos:
-- administradores (ven todo) y asesores (sólo sus leads y conversaciones).
-- También crea un reparto round-robin atómico y cifra el NSS fuera de public.
-- ============================================================

begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- ---------- sólo dos perfiles operativos --------------------------------

do $$
begin
  if exists (
    select 1 from public.perfiles where rol not in ('admin', 'asesor')
  ) then
    raise exception 'Hay perfiles con roles legacy; deben migrarse antes.';
  end if;

  if exists (
    select 1 from public.invitaciones where rol not in ('admin', 'asesor')
  ) then
    raise exception 'Hay invitaciones con roles legacy; deben migrarse antes.';
  end if;
end;
$$;

alter table public.perfiles
  add column apellidos text not null default '',
  add column avatar_path text,
  add column reparto_orden smallint,
  add column recibe_leads boolean not null default false,
  add column perfil_completo boolean not null default false;

alter table public.invitaciones
  add column apellidos text,
  add column reparto_orden smallint,
  add column recibe_leads boolean not null default false;

alter table public.perfiles
  add constraint perfiles_roles_operativos_chk
    check (rol in ('admin', 'asesor')),
  add constraint perfiles_reparto_orden_chk
    check (reparto_orden is null or reparto_orden > 0),
  add constraint perfiles_reparto_rol_chk
    check (
      (rol = 'admin' and not recibe_leads and reparto_orden is null)
      or
      (rol = 'asesor' and (not recibe_leads or reparto_orden is not null))
    ),
  add constraint perfiles_avatar_path_chk
    check (
      avatar_path is null
      or split_part(avatar_path, '/', 1) = id::text
    );

alter table public.invitaciones
  add constraint invitaciones_roles_operativos_chk
    check (rol in ('admin', 'asesor')),
  add constraint invitaciones_reparto_orden_chk
    check (reparto_orden is null or reparto_orden > 0),
  add constraint invitaciones_reparto_rol_chk
    check (
      (rol = 'admin' and not recibe_leads and reparto_orden is null)
      or
      (rol = 'asesor' and (not recibe_leads or reparto_orden is not null))
    );

create unique index perfiles_reparto_orden_uidx
  on public.perfiles (reparto_orden)
  where rol = 'asesor' and activo and recibe_leads;

create unique index invitaciones_reparto_orden_uidx
  on public.invitaciones (reparto_orden)
  where usada_en is null and rol = 'asesor' and recibe_leads;

-- Toda cuenta nueva requiere una invitación vigente. El rol sólo procede de
-- la lista controlada por administradores; user_metadata nunca autoriza.
create or replace function public.crear_perfil_para_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitacion public.invitaciones%rowtype;
  nombre_final text;
  apellidos_final text;
begin
  select * into invitacion
  from public.invitaciones
  where lower(email) = lower(new.email)
    and usada_en is null
  for update;

  if invitacion.id is null then
    raise exception 'Este correo no tiene una invitación vigente.';
  end if;

  nombre_final := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
    nullif(btrim(invitacion.nombre), ''),
    split_part(new.email, '@', 1)
  );
  apellidos_final := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'apellidos'), ''),
    nullif(btrim(invitacion.apellidos), ''),
    ''
  );

  insert into public.perfiles (
    id, nombre, apellidos, email, rol, reparto_orden, recibe_leads,
    perfil_completo
  ) values (
    new.id,
    left(nombre_final, 120),
    left(apellidos_final, 160),
    lower(new.email),
    invitacion.rol,
    invitacion.reparto_orden,
    invitacion.recibe_leads,
    false
  )
  on conflict (id) do nothing;

  update public.invitaciones
  set usada_en = now()
  where id = invitacion.id;

  return new;
end;
$$;

-- Nadie puede ascenderse, reactivar su cuenta o entrar al reparto alterando
-- directamente su perfil. service_role queda habilitado para automatización.
create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_servicio boolean := coalesce(
    (select auth.jwt() ->> 'role') = 'service_role',
    false
  );
  es_sql_admin boolean := session_user in ('postgres', 'supabase_admin');
begin
  if old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo) then
    -- Un candado lógico común evita la carrera de dos demociones simultáneas
    -- sin bloquear las ediciones normales de nombre, teléfono o avatar.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('avansa:administradores', 0)
    );
    if not exists (
      select 1 from public.perfiles
      where id <> old.id and rol = 'admin' and activo
    ) then
      raise exception 'No se puede desactivar o degradar al último administrador.';
    end if;
  end if;

  if old.rol = 'asesor' and old.activo
     and (
       new.rol <> 'asesor'
       or not new.activo
       or not new.recibe_leads
     )
     and exists (
       select 1 from public.leads
       where asesor_id = old.id
         and estado not in ('cerrado', 'descartado')
     ) then
    raise exception 'Reasigna primero los expedientes abiertos de este asesor.';
  end if;

  if (
    new.id is distinct from old.id
    or new.email is distinct from old.email
    or new.rol is distinct from old.rol
    or new.activo is distinct from old.activo
    or new.recibe_leads is distinct from old.recibe_leads
    or new.reparto_orden is distinct from old.reparto_orden
    or new.created_at is distinct from old.created_at
  ) and not (
    es_servicio
    or es_sql_admin
    or exists (
      select 1 from public.perfiles
      where id = (select auth.uid()) and rol = 'admin' and activo
    )
  ) then
    raise exception 'Sólo un administrador puede cambiar acceso o reparto.';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_rol on public.perfiles;
drop trigger if exists perfiles_proteger_perfil on public.perfiles;
create trigger perfiles_proteger_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

create or replace function public.proteger_eliminacion_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'admin' and old.activo then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('avansa:administradores', 0)
    );
    if not exists (
      select 1 from public.perfiles
      where id <> old.id and rol = 'admin' and activo
    ) then
      raise exception 'No se puede eliminar al último administrador.';
    end if;
  end if;

  if exists (
    select 1 from public.leads
    where asesor_id = old.id
      and estado not in ('cerrado', 'descartado')
  ) then
    raise exception 'Reasigna primero los expedientes abiertos de esta persona.';
  end if;

  return old;
end;
$$;

drop trigger if exists perfiles_proteger_eliminacion on public.perfiles;
create trigger perfiles_proteger_eliminacion
  before delete on public.perfiles
  for each row execute function public.proteger_eliminacion_perfil();

revoke all on function public.crear_perfil_para_usuario() from public, anon, authenticated, service_role;
revoke all on function public.proteger_perfil() from public, anon, authenticated, service_role;
revoke all on function public.proteger_eliminacion_perfil() from public, anon, authenticated, service_role;

-- ---------- helpers privados de autorización -----------------------------

create or replace function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and activo
      and rol = 'admin'
  )
$$;

create or replace function private.es_asesor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and activo
      and rol = 'asesor'
  )
$$;

create or replace function private.puede_ver_lead(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.es_admin()
    or exists (
      select 1
      from public.leads
      where id = p_lead_id
        and asesor_id = (select auth.uid())
        and private.es_asesor()
    )
$$;

create or replace function private.puede_ver_conversacion(p_conversacion_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.es_admin()
    or exists (
      select 1
      from public.conversaciones
      where id = p_conversacion_id
        and asignado_a = (select auth.uid())
        and private.es_asesor()
    )
$$;

revoke all on function private.es_admin() from public, anon;
revoke all on function private.es_asesor() from public, anon;
revoke all on function private.puede_ver_lead(uuid) from public, anon;
revoke all on function private.puede_ver_conversacion(bigint) from public, anon;
grant execute on function private.es_admin() to authenticated;
grant execute on function private.es_asesor() to authenticated;
grant execute on function private.puede_ver_lead(uuid) to authenticated;
grant execute on function private.puede_ver_conversacion(bigint) to authenticated;

-- Compatibilidad con las rutas existentes: la regla real queda centralizada.
create or replace function public.puede_ver_conversacion(conv bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.puede_ver_conversacion(conv)
$$;

revoke all on function public.puede_ver_conversacion(bigint) from public, anon;
grant execute on function public.puede_ver_conversacion(bigint) to authenticated;

-- La pantalla de acceso ya no ofrece autorregistro y las políticas nuevas no
-- usan estos helpers legacy. Se cierran como endpoints del Data API.
revoke all on function public.hay_equipo() from public, anon, authenticated, service_role;
revoke all on function public.mi_rol() from public, anon, authenticated, service_role;
revoke all on function public.es_equipo() from public, anon, authenticated, service_role;
revoke all on function public.tiene_rol(variadic public.rol_usuario[])
  from public, anon, authenticated, service_role;

-- ---------- campos del formulario ---------------------------------------

alter table public.leads
  add column submission_id uuid,
  add column telefono_normalizado text,
  add column credito_infonavit_activo boolean,
  add column esta_en_buro_credito boolean,
  add column institucion_buro text,
  add column conoce_ahorro_vivienda boolean,
  add column ahorro_vivienda_aprox numeric(12,2),
  add column base_tratamiento text not null default 'captura_interna',
  add column aviso_privacidad_version text,
  add column consentido_en timestamptz;

alter table public.leads
  drop constraint leads_acepta_privacidad_check,
  add constraint leads_institucion_buro_chk check (
    esta_en_buro_credito is null
    or (esta_en_buro_credito and nullif(btrim(institucion_buro), '') is not null)
    or (not esta_en_buro_credito and institucion_buro is null)
  ),
  add constraint leads_ahorro_vivienda_chk check (
    ahorro_vivienda_aprox is null or ahorro_vivienda_aprox >= 0
  ),
  add constraint leads_conoce_ahorro_chk check (
    conoce_ahorro_vivienda is null
    or (conoce_ahorro_vivienda and ahorro_vivienda_aprox is not null)
    or (not conoce_ahorro_vivienda and ahorro_vivienda_aprox is null)
  ),
  add constraint leads_base_tratamiento_chk check (
    base_tratamiento in (
      'consentimiento_web',
      'contacto_iniciado_whatsapp',
      'captura_interna'
    )
  ),
  add constraint leads_consentimiento_web_chk check (
    base_tratamiento <> 'consentimiento_web'
    or (
      acepta_privacidad
      and nullif(btrim(aviso_privacidad_version), '') is not null
      and consentido_en is not null
    )
  );

create unique index leads_submission_id_uidx
  on public.leads (submission_id)
  where submission_id is not null;
create index leads_telefono_normalizado_idx
  on public.leads (telefono_normalizado);

comment on table public.leads is
  'Contactos y expedientes de avansa. RLS limita a cada asesor a sus propios registros.';
comment on column public.leads.ahorro_vivienda_aprox is
  'Monto aproximado declarado por la persona; nunca se consulta a Infonavit.';

-- ---------- NSS cifrado y auditado --------------------------------------

create table private.lead_nss (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  nss_cifrado bytea not null,
  nss_hmac bytea not null,
  ultimos_4 char(4) not null check (ultimos_4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);

create index lead_nss_hmac_idx on private.lead_nss (nss_hmac);

create table private.accesos_nss (
  id bigint generated always as identity primary key,
  -- Se conserva como referencia histórica aunque el expediente se elimine.
  lead_id uuid not null,
  usuario_id uuid references public.perfiles(id) on delete set null,
  consultado_en timestamptz not null default now()
);
create index accesos_nss_usuario_idx on private.accesos_nss (usuario_id);

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'avansa_nss_enc_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avansa_nss_enc_key',
      'Clave de cifrado del NSS de avansa',
      null
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'avansa_nss_hmac_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avansa_nss_hmac_key',
      'Clave HMAC del NSS de avansa',
      null
    );
  end if;

  if not exists (select 1 from vault.secrets where name = 'avansa_form_rate_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'avansa_form_rate_key',
      'Clave HMAC para limitar formularios sin guardar direcciones IP',
      null
    );
  end if;
end;
$$;

create or replace function private.secreto_vault(p_nombre text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_nombre
  limit 1
$$;

revoke all on function private.secreto_vault(text) from public, anon, authenticated;
revoke all on table private.lead_nss from public, anon, authenticated;
revoke all on table private.accesos_nss from public, anon, authenticated;

create table private.formulario_rate_limit (
  clave bytea not null,
  ventana timestamptz not null,
  intentos integer not null default 1 check (intentos > 0),
  primary key (clave, ventana)
);
create index formulario_rate_limit_ventana_idx
  on private.formulario_rate_limit (ventana);
revoke all on table private.formulario_rate_limit from public, anon, authenticated;

create or replace function public.leer_nss(p_lead_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cifrado bytea;
  v_resultado text;
begin
  if not private.puede_ver_lead(p_lead_id) then
    return null;
  end if;

  select nss_cifrado into v_cifrado
  from private.lead_nss
  where lead_id = p_lead_id;

  if v_cifrado is null then
    return null;
  end if;

  v_resultado := extensions.pgp_sym_decrypt(
    v_cifrado,
    private.secreto_vault('avansa_nss_enc_key'),
    'cipher-algo=aes256,compress-algo=0'
  );

  insert into private.accesos_nss (lead_id, usuario_id)
  values (p_lead_id, (select auth.uid()));

  return v_resultado;
end;
$$;

revoke all on function public.leer_nss(uuid) from public, anon;
grant execute on function public.leer_nss(uuid) to authenticated;

-- ---------- reparto round-robin atómico ---------------------------------

create table private.reparto_estado (
  canal text primary key check (canal = 'global'),
  cursor bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into private.reparto_estado (canal)
values ('global')
on conflict do nothing;

create table private.asignaciones (
  id bigint generated always as identity primary key,
  canal text not null check (canal in ('formulario', 'whatsapp', 'manual')),
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversacion_id bigint references public.conversaciones(id) on delete cascade,
  asesor_id uuid references public.perfiles(id) on delete set null,
  motivo text not null,
  asignado_en timestamptz not null default now()
);

create unique index asignaciones_formulario_uidx
  on private.asignaciones (lead_id, canal)
  where canal = 'formulario';
create unique index asignaciones_manual_uidx
  on private.asignaciones (lead_id, canal)
  where canal = 'manual';
create unique index asignaciones_conversacion_uidx
  on private.asignaciones (conversacion_id)
  where conversacion_id is not null;
create index asignaciones_asesor_idx on private.asignaciones (asesor_id);

revoke all on table private.reparto_estado from public, anon, authenticated;
revoke all on table private.asignaciones from public, anon, authenticated;

create or replace function private.siguiente_asesor(p_canal text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cursor bigint;
  v_asesores uuid[];
  v_total integer;
begin
  if p_canal not in ('formulario', 'whatsapp', 'manual') then
    raise exception 'Canal de reparto inválido.';
  end if;

  insert into private.reparto_estado (canal)
  values ('global')
  on conflict do nothing;

  select cursor into v_cursor
  from private.reparto_estado
  where canal = 'global'
  for update;

  select array_agg(id order by reparto_orden, created_at, id)
  into v_asesores
  from (
    select id, reparto_orden, created_at
    from public.perfiles
    where rol = 'asesor'
      and activo
      and recibe_leads
      and reparto_orden is not null
    for share
  ) asesores;

  v_total := coalesce(cardinality(v_asesores), 0);
  if v_total = 0 then
    return null;
  end if;

  update private.reparto_estado
  set cursor = cursor + 1, updated_at = now()
  where canal = 'global';

  return v_asesores[(v_cursor % v_total) + 1];
end;
$$;

revoke all on function private.siguiente_asesor(text) from public, anon, authenticated;

-- Unifica teléfonos locales y E.164 para que el formulario y WhatsApp de la
-- misma persona siempre conserven el mismo asesor.
create or replace function private.normalizar_telefono(p_telefono text)
returns text
language sql
immutable
set search_path = ''
as $$
  with limpio as (
    select regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g') as d
  )
  select case
    when char_length(d) = 10 then '52' || d
    when char_length(d) = 13 and d like '521%' then '52' || substr(d, 4)
    when char_length(d) between 11 and 15 then d
    else null
  end
  from limpio
$$;

revoke all on function private.normalizar_telefono(text) from public, anon, authenticated;

create or replace function public.normalizar_telefono_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.telefono_normalizado := private.normalizar_telefono(new.telefono);
  if new.telefono_normalizado is null then
    raise exception 'El teléfono no es válido.';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_normalizar_telefono on public.leads;
create trigger leads_normalizar_telefono
  before insert or update of telefono on public.leads
  for each row execute function public.normalizar_telefono_lead();

revoke all on function public.normalizar_telefono_lead() from public, anon, authenticated, service_role;

create or replace function public.validar_asesor_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asesor_id is not null then
    perform 1
    from public.perfiles
    where id = new.asesor_id and rol = 'asesor' and activo
    for share;

    if not found then
      raise exception 'El responsable debe ser un asesor activo.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_validar_asesor on public.leads;
create trigger leads_validar_asesor
  before insert or update of asesor_id on public.leads
  for each row execute function public.validar_asesor_lead();

revoke all on function public.validar_asesor_lead() from public, anon, authenticated;

-- ---------- única puerta del formulario web -----------------------------

create or replace function public.registrar_formulario_web(
  p_submission_id uuid,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_nss text,
  p_credito_infonavit_activo boolean,
  p_en_buro_credito boolean,
  p_institucion_buro text,
  p_conoce_ahorro_vivienda boolean,
  p_ahorro_vivienda_aprox numeric,
  p_acepta_privacidad boolean,
  p_aviso_privacidad_version text,
  p_origen text,
  p_utm jsonb,
  p_cliente_red text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_asesor uuid;
  v_motivo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_telefono_normalizado text := private.normalizar_telefono(p_telefono);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nss text := regexp_replace(coalesce(p_nss, ''), '[^0-9]', '', 'g');
  v_institucion text := nullif(btrim(coalesce(p_institucion_buro, '')), '');
  v_rate_clave bytea;
  v_rate_intentos integer;
  v_rate_ventana timestamptz := date_trunc('hour', now());
begin
  if p_submission_id is null then
    raise exception 'Falta el identificador del formulario.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_submission_id::text, 0)
  );

  select id into v_id
  from public.leads
  where submission_id = p_submission_id;
  if v_id is not null then
    return v_id;
  end if;

  if char_length(v_nombre) < 3 or char_length(v_nombre) > 120 then
    raise exception 'El nombre completo no es válido.';
  end if;
  if v_telefono_normalizado is null then
    raise exception 'El teléfono no es válido.';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 160 then
    raise exception 'El correo no es válido.';
  end if;
  if char_length(v_nss) <> 11 then
    raise exception 'El NSS debe tener 11 dígitos.';
  end if;
  if p_credito_infonavit_activo is null or p_en_buro_credito is null
     or p_conoce_ahorro_vivienda is null then
    raise exception 'Faltan respuestas obligatorias.';
  end if;
  if p_en_buro_credito and v_institucion is null then
    raise exception 'Falta la institución reportante.';
  end if;
  if not p_en_buro_credito then
    v_institucion := null;
  end if;
  if p_conoce_ahorro_vivienda
     and (p_ahorro_vivienda_aprox is null or p_ahorro_vivienda_aprox <= 0) then
    raise exception 'El ahorro aproximado no es válido.';
  end if;
  if not p_conoce_ahorro_vivienda then
    p_ahorro_vivienda_aprox := null;
  end if;
  if p_acepta_privacidad is not true then
    raise exception 'Se requiere autorización para tratar los datos.';
  end if;
  if p_utm is not null and (
    jsonb_typeof(p_utm) <> 'object' or pg_column_size(p_utm) > 8192
  ) then
    raise exception 'La atribución no es válida.';
  end if;

  if char_length(coalesce(p_cliente_red, '')) > 128 then
    raise exception 'El identificador de red no es válido.';
  end if;

  -- Límite servidor: la IP sólo existe durante esta llamada. En la tabla se
  -- conserva un HMAC no reversible y se purgan ventanas antiguas.
  v_rate_clave := extensions.hmac(
    coalesce(nullif(btrim(p_cliente_red), ''), 'sin-ip'),
    private.secreto_vault('avansa_form_rate_key'),
    'sha256'
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(encode(v_rate_clave, 'hex'), 2)
  );
  insert into private.formulario_rate_limit (clave, ventana, intentos)
  values (v_rate_clave, v_rate_ventana, 1)
  on conflict (clave, ventana) do update
    set intentos = private.formulario_rate_limit.intentos + 1
  returning intentos into v_rate_intentos;

  if v_rate_intentos > 15 then
    raise exception 'Demasiados formularios. Intenta más tarde.';
  end if;

  delete from private.formulario_rate_limit
  where ventana < now() - interval '48 hours';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_telefono_normalizado, 1)
  );

  -- Si la misma persona ya escribió por WhatsApp u otro canal, su nueva
  -- solicitud conserva asesor y no consume dos turnos del reparto global.
  select l.asesor_id into v_asesor
  from public.leads l
  join public.perfiles p
    on p.id = l.asesor_id
   and p.rol = 'asesor'
   and p.activo
   and p.recibe_leads
  where l.telefono_normalizado = v_telefono_normalizado
    and l.estado not in ('cerrado', 'descartado')
  order by l.created_at desc
  limit 1
  for share of l;

  if v_asesor is null then
    v_asesor := private.siguiente_asesor('formulario');
    v_motivo := 'round_robin_global';
  else
    v_motivo := 'contacto_existente';
  end if;

  if v_asesor is null then
    raise exception 'No hay asesores activos disponibles en este momento.';
  end if;

  insert into public.leads (
    submission_id,
    nombre,
    telefono,
    telefono_normalizado,
    email,
    saldo_subcuenta,
    credito_infonavit_activo,
    esta_en_buro_credito,
    institucion_buro,
    conoce_ahorro_vivienda,
    ahorro_vivienda_aprox,
    acepta_privacidad,
    base_tratamiento,
    aviso_privacidad_version,
    consentido_en,
    origen,
    canal,
    utm,
    asesor_id
  ) values (
    p_submission_id,
    left(v_nombre, 120),
    left(v_telefono, 30),
    v_telefono_normalizado,
    v_email,
    p_ahorro_vivienda_aprox,
    p_credito_infonavit_activo,
    p_en_buro_credito,
    left(v_institucion, 120),
    p_conoce_ahorro_vivienda,
    p_ahorro_vivienda_aprox,
    true,
    'consentimiento_web',
    left(nullif(btrim(coalesce(p_aviso_privacidad_version, '')), ''), 40),
    now(),
    coalesce(left(nullif(btrim(coalesce(p_origen, '')), ''), 60), 'sitio-web'),
    'formulario',
    p_utm,
    v_asesor
  )
  returning id into v_id;

  insert into private.lead_nss (lead_id, nss_cifrado, nss_hmac, ultimos_4)
  values (
    v_id,
    extensions.pgp_sym_encrypt(
      v_nss,
      private.secreto_vault('avansa_nss_enc_key'),
      'cipher-algo=aes256,compress-algo=0'
    ),
    extensions.hmac(
      v_nss,
      private.secreto_vault('avansa_nss_hmac_key'),
      'sha256'
    ),
    right(v_nss, 4)
  );

  insert into private.asignaciones (canal, lead_id, asesor_id, motivo)
  values (
    'formulario',
    v_id,
    v_asesor,
    v_motivo
  );

  return v_id;
end;
$$;

revoke all on function public.registrar_formulario_web(
  uuid, text, text, text, text, boolean, boolean, text, boolean,
  numeric, boolean, text, text, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.registrar_formulario_web(
  uuid, text, text, text, text, boolean, boolean, text, boolean,
  numeric, boolean, text, text, jsonb, text
) to service_role;

revoke all on function public.registrar_lead(
  text, text, text, text, numeric, text, boolean, text, text, jsonb
) from public, anon, authenticated, service_role;

-- Las altas internas tampoco escriben directamente en `leads`: este RPC
-- evita que alguien pueda forjar columnas del sistema o adjudicarse un lead
-- central. Un asesor conserva su captura; un admin usa el reparto global.
create or replace function public.registrar_lead_manual(
  p_nombre text,
  p_telefono text,
  p_email text,
  p_estado_republica text,
  p_saldo_subcuenta numeric,
  p_tipo_mejora text,
  p_mensaje text,
  p_origen text,
  p_canal text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_es_admin boolean := private.es_admin();
  v_es_asesor boolean := private.es_asesor();
  v_id uuid;
  v_existente_asesor uuid;
  v_asesor uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_telefono text := btrim(coalesce(p_telefono, ''));
  v_telefono_normalizado text := private.normalizar_telefono(p_telefono);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_motivo text;
begin
  if v_usuario is null or not (v_es_admin or v_es_asesor) then
    raise exception 'No tienes permiso para registrar contactos.';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 120 then
    raise exception 'El nombre completo no es válido.';
  end if;
  if v_telefono_normalizado is null then
    raise exception 'El teléfono no es válido.';
  end if;
  if v_email is not null
     and (v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 160) then
    raise exception 'El correo no es válido.';
  end if;
  if p_saldo_subcuenta is not null and p_saldo_subcuenta < 0 then
    raise exception 'El saldo declarado no es válido.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_telefono_normalizado, 1)
  );

  select l.id, l.asesor_id
  into v_id, v_existente_asesor
  from public.leads l
  where l.telefono_normalizado = v_telefono_normalizado
    and l.estado not in ('cerrado', 'descartado')
  order by l.created_at desc
  limit 1
  for update;

  if v_id is not null then
    if v_es_asesor and v_existente_asesor is distinct from v_usuario then
      raise exception 'Este contacto ya tiene un expediente activo.';
    end if;

    if v_es_admin and (
      v_existente_asesor is null
      or not exists (
        select 1 from public.perfiles
        where id = v_existente_asesor
          and rol = 'asesor' and activo and recibe_leads
      )
    ) then
      v_asesor := private.siguiente_asesor('manual');
      if v_asesor is null then
        raise exception 'No hay asesores activos disponibles en este momento.';
      end if;
      update public.leads set asesor_id = v_asesor where id = v_id;
    end if;

    return v_id;
  end if;

  if v_es_asesor then
    v_asesor := v_usuario;
    v_motivo := 'captura_del_asesor';
  else
    v_asesor := private.siguiente_asesor('manual');
    v_motivo := 'round_robin_global';
  end if;

  if v_asesor is null then
    raise exception 'No hay asesores activos disponibles en este momento.';
  end if;

  insert into public.leads (
    nombre, telefono, email, estado_republica, saldo_subcuenta,
    tipo_mejora, mensaje, acepta_privacidad, base_tratamiento,
    consentido_en, origen, canal, asesor_id, estado, probabilidad
  ) values (
    left(v_nombre, 120),
    left(v_telefono, 30),
    left(v_email, 160),
    left(nullif(btrim(coalesce(p_estado_republica, '')), ''), 60),
    p_saldo_subcuenta,
    left(nullif(btrim(coalesce(p_tipo_mejora, '')), ''), 80),
    left(nullif(btrim(coalesce(p_mensaje, '')), ''), 1200),
    true,
    'captura_interna',
    now(),
    coalesce(left(nullif(btrim(coalesce(p_origen, '')), ''), 60), 'captura-manual'),
    left(nullif(btrim(coalesce(p_canal, '')), ''), 60),
    v_asesor,
    'contactado',
    15
  )
  returning id into v_id;

  insert into private.asignaciones (canal, lead_id, asesor_id, motivo)
  values ('manual', v_id, v_asesor, v_motivo);

  return v_id;
end;
$$;

revoke all on function public.registrar_lead_manual(
  text, text, text, text, numeric, text, text, text, text
) from public, anon, service_role;
grant execute on function public.registrar_lead_manual(
  text, text, text, text, numeric, text, text, text, text
) to authenticated;

-- ---------- WhatsApp / Chatwoot preparado -------------------------------

alter table public.conversaciones
  add column contacto_nombre text,
  add column contacto_telefono text,
  add column contacto_email text,
  add column ultima_actividad_en timestamptz;

create or replace function public.registrar_conversacion_whatsapp(
  p_conversacion_id bigint,
  p_bandeja_id bigint,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_mensaje_inicial text
)
returns table (lead_id uuid, asesor_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_asesor_id uuid;
  v_motivo text;
  v_telefono text := private.normalizar_telefono(p_telefono);
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if p_conversacion_id is null or p_bandeja_id is null then
    raise exception 'Falta identificar la conversación o la bandeja.';
  end if;
  if v_telefono is null then
    raise exception 'El teléfono de WhatsApp no es válido.';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    v_email := null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(p_conversacion_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_telefono, 1)
  );

  select c.lead_id
  into v_lead_id
  from public.conversaciones c
  where c.id = p_conversacion_id
    and c.lead_id is not null;

  if v_lead_id is not null then
    -- El lead es la fuente de verdad. `conversaciones.asignado_a` es sólo un
    -- reflejo y puede venir retrasado si se reintentó un webhook.
    select l.asesor_id
    into v_asesor_id
    from public.leads l
    where l.id = v_lead_id
    for update;

    if v_asesor_id is null or not exists (
      select 1 from public.perfiles
      where id = v_asesor_id
        and rol = 'asesor' and activo and recibe_leads
    ) then
      v_asesor_id := private.siguiente_asesor('whatsapp');
      if v_asesor_id is null then
        raise exception 'No hay asesores activos disponibles en este momento.';
      end if;
      update public.leads
      set asesor_id = v_asesor_id
      where id = v_lead_id;
    end if;

    update public.conversaciones
    set asignado_a = v_asesor_id,
        asignado_en = coalesce(asignado_en, now()),
        contacto_nombre = coalesce(left(v_nombre, 120), contacto_nombre),
        contacto_telefono = left(p_telefono, 30),
        contacto_email = coalesce(left(v_email, 160), contacto_email),
        ultima_actividad_en = now()
    where id = p_conversacion_id;
    return query select v_lead_id, v_asesor_id;
    return;
  end if;

  select l.id, l.asesor_id
  into v_lead_id, v_asesor_id
  from public.leads l
  where l.telefono_normalizado = v_telefono
    and l.estado not in ('cerrado', 'descartado')
  order by l.created_at desc
  limit 1
  for update;

  if v_lead_id is null then
    v_asesor_id := private.siguiente_asesor('whatsapp');
    if v_asesor_id is null then
      raise exception 'No hay asesores activos disponibles en este momento.';
    end if;
    v_motivo := 'round_robin_global';

    insert into public.leads (
      nombre, telefono, telefono_normalizado, email,
      acepta_privacidad, base_tratamiento, origen, canal, asesor_id
    ) values (
      left(coalesce(v_nombre, v_telefono), 120),
      left(p_telefono, 30),
      v_telefono,
      left(v_email, 160),
      false,
      'contacto_iniciado_whatsapp',
      'whatsapp',
      'whatsapp',
      v_asesor_id
    )
    returning id into v_lead_id;
  elsif v_asesor_id is null or not exists (
    select 1 from public.perfiles
    where id = v_asesor_id
      and rol = 'asesor' and activo and recibe_leads
  ) then
    v_asesor_id := private.siguiente_asesor('whatsapp');
    if v_asesor_id is null then
      raise exception 'No hay asesores activos disponibles en este momento.';
    end if;
    v_motivo := 'reasignacion_automatica';
    update public.leads
    set asesor_id = v_asesor_id
    where id = v_lead_id;
  else
    v_motivo := 'contacto_existente';
  end if;

  insert into public.conversaciones (
    id, bandeja_id, asignado_a, asignado_en, lead_id,
    contacto_nombre, contacto_telefono, contacto_email, ultima_actividad_en
  ) values (
    p_conversacion_id,
    p_bandeja_id,
    v_asesor_id,
    case when v_asesor_id is null then null else now() end,
    v_lead_id,
    left(v_nombre, 120),
    left(p_telefono, 30),
    left(v_email, 160),
    now()
  )
  on conflict (id) do update set
    bandeja_id = excluded.bandeja_id,
    asignado_a = excluded.asignado_a,
    asignado_en = coalesce(public.conversaciones.asignado_en, excluded.asignado_en),
    lead_id = excluded.lead_id,
    contacto_nombre = excluded.contacto_nombre,
    contacto_telefono = excluded.contacto_telefono,
    contacto_email = excluded.contacto_email,
    ultima_actividad_en = excluded.ultima_actividad_en;

  insert into private.asignaciones (
    canal, lead_id, conversacion_id, asesor_id, motivo
  ) values (
    'whatsapp',
    v_lead_id,
    p_conversacion_id,
    v_asesor_id,
    v_motivo
  )
  on conflict do nothing;

  insert into public.actividades (lead_id, autor_id, tipo, titulo, detalle)
  values (
    v_lead_id,
    null,
    'sistema',
    'Conversación iniciada por WhatsApp',
    left(nullif(btrim(coalesce(p_mensaje_inicial, '')), ''), 4000)
  );

  return query select v_lead_id, v_asesor_id;
end;
$$;

revoke all on function public.registrar_conversacion_whatsapp(
  bigint, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.registrar_conversacion_whatsapp(
  bigint, bigint, text, text, text, text
) to service_role;

create or replace function public.alinear_asignacion_conversacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asesor uuid;
begin
  if new.lead_id is not null then
    select asesor_id into v_asesor
    from public.leads
    where id = new.lead_id;
    new.asignado_a := v_asesor;
    new.asignado_en := case
      when v_asesor is null then null
      else coalesce(new.asignado_en, now())
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists conversaciones_alinear_asignacion on public.conversaciones;
create trigger conversaciones_alinear_asignacion
  before insert or update of lead_id, asignado_a on public.conversaciones
  for each row execute function public.alinear_asignacion_conversacion();

revoke all on function public.alinear_asignacion_conversacion()
  from public, anon, authenticated, service_role;

create or replace function public.propagar_asesor_a_conversaciones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.asesor_id is distinct from old.asesor_id then
    update public.conversaciones
    set asignado_a = new.asesor_id,
        asignado_en = case when new.asesor_id is null then null else now() end,
        asignado_por = (select auth.uid())
    where lead_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_propagar_asesor on public.leads;
create trigger leads_propagar_asesor
  after update of asesor_id on public.leads
  for each row execute function public.propagar_asesor_a_conversaciones();

revoke all on function public.propagar_asesor_a_conversaciones()
  from public, anon, authenticated, service_role;

create index if not exists actividades_autor_idx
  on public.actividades (autor_id);
create index if not exists conversaciones_asignado_por_idx
  on public.conversaciones (asignado_por);
create index if not exists invitaciones_invitada_por_idx
  on public.invitaciones (invitada_por);
create index if not exists movimientos_creado_por_idx
  on public.movimientos (creado_por);
create index if not exists respuestas_autor_idx
  on public.respuestas (autor_id);

-- ---------- RLS estricta por propietario --------------------------------

alter table public.perfiles enable row level security;
alter table public.invitaciones enable row level security;
alter table public.leads enable row level security;
alter table public.actividades enable row level security;
alter table public.documentos enable row level security;
alter table public.conversaciones enable row level security;
alter table public.respuestas enable row level security;
alter table public.campanas enable row level security;
alter table public.metricas_campana enable row level security;
alter table public.categorias_finanzas enable row level security;
alter table public.movimientos enable row level security;
alter table public.metas enable row level security;

drop policy if exists "equipo ve al equipo" on public.perfiles;
drop policy if exists "cada quien edita lo suyo" on public.perfiles;
drop policy if exists "admin administra perfiles" on public.perfiles;
drop policy if exists "admin ve perfiles" on public.perfiles;
drop policy if exists "cada persona ve su perfil" on public.perfiles;
drop policy if exists "cada persona edita su perfil" on public.perfiles;
drop policy if exists "usuarios ven perfiles permitidos" on public.perfiles;
drop policy if exists "usuarios actualizan perfiles permitidos" on public.perfiles;
create policy "usuarios ven perfiles permitidos"
  on public.perfiles for select to authenticated
  using (private.es_admin() or id = (select auth.uid()));
create policy "usuarios actualizan perfiles permitidos"
  on public.perfiles for update to authenticated
  using (private.es_admin() or id = (select auth.uid()))
  with check (private.es_admin() or id = (select auth.uid()));

drop policy if exists "admin administra invitaciones" on public.invitaciones;
create policy "admin administra invitaciones"
  on public.invitaciones for all to authenticated
  using (private.es_admin())
  with check (private.es_admin());

drop policy if exists "equipo trabaja leads" on public.leads;
drop policy if exists "equipo alta leads" on public.leads;
drop policy if exists "equipo edita leads" on public.leads;
drop policy if exists "admin borra leads" on public.leads;
create policy "cada quien ve sus leads"
  on public.leads for select to authenticated
  using (private.es_admin() or (
    private.es_asesor() and asesor_id = (select auth.uid())
  ));
drop policy if exists "alta interna de leads" on public.leads;
create policy "edita sus leads"
  on public.leads for update to authenticated
  using (private.es_admin() or (
    private.es_asesor() and asesor_id = (select auth.uid())
  ))
  with check (private.es_admin() or (
    private.es_asesor() and asesor_id = (select auth.uid())
  ));
create policy "admin borra leads"
  on public.leads for delete to authenticated
  using (private.es_admin());

drop policy if exists "equipo trabaja actividades" on public.actividades;
drop policy if exists "equipo alta actividades" on public.actividades;
drop policy if exists "equipo edita actividades" on public.actividades;
drop policy if exists "admin borra actividades" on public.actividades;
create policy "ve actividades de sus leads"
  on public.actividades for select to authenticated
  using (private.puede_ver_lead(lead_id));
create policy "registra actividades de sus leads"
  on public.actividades for insert to authenticated
  with check (
    private.puede_ver_lead(lead_id)
    and (private.es_admin() or autor_id = (select auth.uid()))
  );
create policy "edita sus actividades"
  on public.actividades for update to authenticated
  using (
    private.puede_ver_lead(lead_id)
    and (private.es_admin() or autor_id = (select auth.uid()))
  )
  with check (
    private.puede_ver_lead(lead_id)
    and (private.es_admin() or autor_id = (select auth.uid()))
  );
create policy "admin borra actividades"
  on public.actividades for delete to authenticated
  using (private.es_admin());

drop policy if exists "equipo trabaja documentos" on public.documentos;
drop policy if exists "equipo alta documentos" on public.documentos;
drop policy if exists "equipo edita documentos" on public.documentos;
drop policy if exists "admin borra documentos" on public.documentos;
create policy "ve documentos de sus leads"
  on public.documentos for select to authenticated
  using (private.puede_ver_lead(lead_id));
create policy "alta documentos de sus leads"
  on public.documentos for insert to authenticated
  with check (private.puede_ver_lead(lead_id));
create policy "edita documentos de sus leads"
  on public.documentos for update to authenticated
  using (private.puede_ver_lead(lead_id))
  with check (private.puede_ver_lead(lead_id));
create policy "admin borra documentos"
  on public.documentos for delete to authenticated
  using (private.es_admin());

drop policy if exists "ve lo suyo y lo libre" on public.conversaciones;
drop policy if exists "toma lo que está libre" on public.conversaciones;
drop policy if exists "admin reparte" on public.conversaciones;
drop policy if exists "registra conversaciones nuevas" on public.conversaciones;
drop policy if exists "admin administra conversaciones" on public.conversaciones;
create policy "ve conversaciones permitidas"
  on public.conversaciones for select to authenticated
  using (private.puede_ver_conversacion(id));

drop policy if exists "ve las respuestas que puede" on public.respuestas;
drop policy if exists "firma sus respuestas" on public.respuestas;
create policy "ve respuestas permitidas"
  on public.respuestas for select to authenticated
  using (private.puede_ver_conversacion(conversacion_id));
create policy "asesor firma sus respuestas"
  on public.respuestas for insert to authenticated
  with check (
    private.es_asesor()
    and autor_id = (select auth.uid())
    and private.puede_ver_conversacion(conversacion_id)
  );

-- Los módulos corporativos quedan exclusivamente bajo administración. La
-- navegación ya los oculta a asesores; estas políticas hacen que tampoco
-- puedan consultarlos directamente por la API.
do $$
declare
  t text;
begin
  foreach t in array array[
    'campanas', 'metricas_campana',
    'categorias_finanzas', 'movimientos', 'metas'
  ] loop
    execute format('drop policy if exists "equipo lee %1$s" on public.%1$I', t);
    execute format('drop policy if exists "marketing escribe %1$s" on public.%1$I', t);
    execute format('drop policy if exists "finanzas opera %1$s" on public.%1$I', t);
    execute format('drop policy if exists "admin opera %1$s" on public.%1$I', t);
    execute format(
      'create policy "admin opera %1$s" on public.%1$I for all to authenticated using (private.es_admin()) with check (private.es_admin())',
      t
    );
  end loop;
end;
$$;
drop policy if exists "equipo lee metas" on public.metas;

-- RLS decide qué filas; los privilegios de columna deciden qué operaciones y
-- qué campos son siquiera intentables. Así `authenticated` no conserva
-- TRUNCATE, TRIGGER, REFERENCES ni escrituras sobre metadatos del formulario.
revoke all on table public.leads from public, anon, authenticated;
revoke all on table public.actividades from public, anon, authenticated;
revoke all on table public.documentos from public, anon, authenticated;
revoke all on table public.conversaciones from public, anon, authenticated;
revoke all on table public.respuestas from public, anon, authenticated;
revoke all on table public.perfiles from public, anon, authenticated;
revoke all on table public.invitaciones from public, anon, authenticated;
revoke all on table public.campanas from public, anon, authenticated;
revoke all on table public.metricas_campana from public, anon, authenticated;
revoke all on table public.categorias_finanzas from public, anon, authenticated;
revoke all on table public.movimientos from public, anon, authenticated;
revoke all on table public.metas from public, anon, authenticated;

grant select on table public.perfiles to authenticated;
grant update (
  nombre, apellidos, telefono, avatar_path, perfil_completo,
  rol, activo, reparto_orden, recibe_leads
) on table public.perfiles to authenticated;

grant select, insert, update, delete
  on table public.invitaciones to authenticated;

grant select, delete on table public.leads to authenticated;
grant update (
  nombre, telefono, email, estado_republica, saldo_subcuenta,
  tipo_mejora, vivienda_a_su_nombre, mensaje, estado, clasificacion,
  asesor_id, valor_estimado, probabilidad, proxima_accion,
  fecha_proxima_accion, motivo_descarte, notas_internas
) on table public.leads to authenticated;

grant select, insert, update, delete
  on table public.actividades to authenticated;
grant select, insert, update, delete
  on table public.documentos to authenticated;
grant select on table public.conversaciones to authenticated;
grant select, insert on table public.respuestas to authenticated;
grant select, insert, update, delete
  on table public.campanas, public.metricas_campana,
           public.categorias_finanzas, public.movimientos, public.metas
  to authenticated;

revoke all on table
  public.v_pipeline,
  public.v_leads_diario,
  public.v_embudo,
  public.v_marketing_campana,
  public.v_estado_resultados_mensual
  from public, anon, authenticated;
grant select on table
  public.v_pipeline,
  public.v_leads_diario,
  public.v_embudo,
  public.v_marketing_campana,
  public.v_estado_resultados_mensual
  to authenticated;

-- ---------- avatares privados -------------------------------------------

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'avansa-avatars',
  'avansa-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "usuarios ven sus avatares" on storage.objects;
drop policy if exists "usuarios suben sus avatares" on storage.objects;
drop policy if exists "usuarios editan sus avatares" on storage.objects;
drop policy if exists "usuarios borran sus avatares" on storage.objects;

create policy "usuarios ven sus avatares"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avansa-avatars'
    and (private.es_admin() or private.es_asesor())
    and (
      private.es_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "usuarios suben sus avatares"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avansa-avatars'
    and (private.es_admin() or private.es_asesor())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "usuarios editan sus avatares"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avansa-avatars'
    and (private.es_admin() or private.es_asesor())
    and (
      private.es_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
  with check (
    bucket_id = 'avansa-avatars'
    and (private.es_admin() or private.es_asesor())
    and (
      private.es_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

create policy "usuarios borran sus avatares"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avansa-avatars'
    and (private.es_admin() or private.es_asesor())
    and (
      private.es_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );

revoke create on schema public from public;
revoke select on vault.decrypted_secrets from public, anon, authenticated;

-- Las funciones nuevas ya no nacen expuestas como RPC por omisión.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

comment on function public.registrar_formulario_web is
  'Alta idempotente del formulario web; asigna asesor y cifra el NSS.';
comment on function public.registrar_conversacion_whatsapp is
  'Alta idempotente desde Chatwoot; enlaza lead y reparte por WhatsApp.';

commit;

-- Rollback intencionalmente no automático. Si private.lead_nss,
-- private.asignaciones o storage.objects ya contienen datos, eliminar estas
-- estructuras destruiría información real. Cualquier reversión debe ser un
-- forward-fix o una restauración verificada desde backup.
