-- ============================================================
-- avansa · correcciones reproducibles para publicación social
-- ============================================================
-- Esta migración repite de forma idempotente los cambios de las migraciones
-- base para proyectos donde 20260828012858/25916/34800 ya fueron aplicadas.

-- ---------- privilegios y RLS -------------------------------------------

revoke all on table public.integraciones_google from public, anon, authenticated;
grant select, insert, update, delete on table public.integraciones_google to service_role;

revoke all on table public.contenidos_sociales from public, anon, authenticated;
revoke all on table public.contenido_medios from public, anon, authenticated;
grant select, insert, update, delete on table public.contenidos_sociales to authenticated, service_role;
grant select, insert, update, delete on table public.contenido_medios to authenticated, service_role;

revoke all on type public.tipo_contenido_social from public, anon;
revoke all on type public.estado_contenido_social from public, anon;
grant usage on type public.tipo_contenido_social to authenticated, service_role;
grant usage on type public.estado_contenido_social to authenticated, service_role;

drop policy if exists "administradores gestionan contenidos sociales" on public.contenidos_sociales;
create policy "administradores gestionan contenidos sociales"
  on public.contenidos_sociales for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

drop policy if exists "administradores gestionan medios sociales" on public.contenido_medios;
create policy "administradores gestionan medios sociales"
  on public.contenido_medios for all to authenticated
  using ((select private.es_admin()))
  with check ((select private.es_admin()));

drop policy if exists "administradores leen medios de contenido avansa" on storage.objects;
create policy "administradores leen medios de contenido avansa"
  on storage.objects for select to authenticated
  using (bucket_id = 'avansa-contenido' and (select private.es_admin()));

drop policy if exists "administradores suben medios de contenido avansa" on storage.objects;
create policy "administradores suben medios de contenido avansa"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avansa-contenido' and (select private.es_admin()));

drop policy if exists "administradores actualizan medios de contenido avansa" on storage.objects;
create policy "administradores actualizan medios de contenido avansa"
  on storage.objects for update to authenticated
  using (bucket_id = 'avansa-contenido' and (select private.es_admin()))
  with check (bucket_id = 'avansa-contenido' and (select private.es_admin()));

drop policy if exists "administradores borran medios de contenido avansa" on storage.objects;
create policy "administradores borran medios de contenido avansa"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avansa-contenido' and (select private.es_admin()));

-- ---------- aprobación y fencing ---------------------------------------

alter table public.contenidos_sociales
  add column if not exists autorizado_en timestamptz,
  add column if not exists autorizado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists publicacion_intentos smallint not null default 0,
  add column if not exists siguiente_intento_en timestamptz,
  add column if not exists bloqueado_hasta timestamptz,
  add column if not exists lease_token uuid;

comment on column public.contenidos_sociales.lease_token is
  'Token de fencing del trabajador. Toda escritura de la cola debe presentar el token vigente.';

-- Las ejecuciones creadas antes del fencing no pueden reanudarse con certeza:
-- se aíslan para revisión manual en lugar de arriesgar una publicación doble.
update public.contenidos_sociales
set estado = 'error',
    error_publicacion = coalesce(
      nullif(error_publicacion, ''),
      'Publicación pausada al activar el bloqueo seguro. Revisa Meta antes de reintentar.'
    ),
    siguiente_intento_en = null,
    bloqueado_hasta = null,
    lease_token = null
where estado = 'publicando';

update public.contenidos_sociales
set bloqueado_hasta = null,
    lease_token = null
where estado <> 'publicando'
  and (bloqueado_hasta is not null or lease_token is not null);

alter table public.contenidos_sociales
  drop constraint if exists contenidos_sociales_lease_coherente_check;
alter table public.contenidos_sociales
  add constraint contenidos_sociales_lease_coherente_check check (
    (
      estado = 'publicando'
      and autorizado_en is not null
      and autorizado_por is not null
      and programado_para is not null
      and bloqueado_hasta is not null
      and lease_token is not null
    )
    or (
      estado <> 'publicando'
      and bloqueado_hasta is null
      and lease_token is null
    )
  );

create or replace function private.invalidar_autorizacion_contenido_social()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.titulo is distinct from old.titulo
     or new.texto is distinct from old.texto
     or new.tipo is distinct from old.tipo
     or new.plataformas is distinct from old.plataformas
     or new.programado_para is distinct from old.programado_para then
    new.autorizado_en := null;
    new.autorizado_por := null;
  end if;
  return new;
end;
$$;

create or replace function private.invalidar_autorizacion_por_medio_social()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_contenidos uuid[];
begin
  if tg_op = 'INSERT' then
    v_contenidos := array[new.contenido_id];
  elsif tg_op = 'DELETE' then
    v_contenidos := array[old.contenido_id];
  else
    v_contenidos := array[old.contenido_id, new.contenido_id];
  end if;

  -- Se actualiza incluso si la autorización ya era null: updated_at funciona
  -- como versión para el CAS de la acción que autoriza tras validar en Meta.
  update public.contenidos_sociales
  set autorizado_en = null,
      autorizado_por = null
  where id = any(v_contenidos);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.invalidar_autorizacion_contenido_social()
  from public, anon, authenticated, service_role;
revoke all on function private.invalidar_autorizacion_por_medio_social()
  from public, anon, authenticated, service_role;

drop trigger if exists contenidos_sociales_invalidar_autorizacion on public.contenidos_sociales;
create trigger contenidos_sociales_invalidar_autorizacion
  before update of titulo, texto, tipo, plataformas, programado_para
  on public.contenidos_sociales
  for each row execute function private.invalidar_autorizacion_contenido_social();

drop trigger if exists contenido_medios_invalidar_autorizacion on public.contenido_medios;
create trigger contenido_medios_invalidar_autorizacion
  after insert or update or delete on public.contenido_medios
  for each row execute function private.invalidar_autorizacion_por_medio_social();

create or replace function public.reclamar_contenido_social(
  p_id uuid,
  p_ahora timestamptz,
  p_bloqueado_hasta timestamptz,
  p_lease_token uuid
)
returns setof public.contenidos_sociales
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.contenidos_sociales
  set estado = 'publicando',
      bloqueado_hasta = p_bloqueado_hasta,
      lease_token = p_lease_token,
      publicacion_intentos = publicacion_intentos + 1
  where id = p_id
    and estado = 'programado'
    and autorizado_en is not null
    and autorizado_por is not null
    and programado_para is not null
    and programado_para <= p_ahora
    and (siguiente_intento_en is null or siguiente_intento_en <= p_ahora)
    and publicacion_intentos < 50
    and p_lease_token is not null
    and p_bloqueado_hasta > p_ahora
  returning *
$$;

revoke all on function public.reclamar_contenido_social(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.reclamar_contenido_social(uuid, timestamptz, timestamptz, uuid)
  to service_role;

-- ---------- cron tolerante y observable --------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists private.solicitudes_publicador_cron (
  request_id       bigint primary key,
  solicitado_en    timestamptz not null default clock_timestamp(),
  respondido_en    timestamptz,
  revisado_en      timestamptz,
  status_code      integer,
  timed_out        boolean,
  error_msg        text check (error_msg is null or char_length(error_msg) <= 500)
);

comment on table private.solicitudes_publicador_cron is
  'Monitoreo mínimo de pg_net para el publicador social; nunca guarda secretos ni contenido.';

revoke all on table private.solicitudes_publicador_cron
  from public, anon, authenticated;
grant select on table private.solicitudes_publicador_cron to service_role;

create index if not exists solicitudes_publicador_cron_pendientes_idx
  on private.solicitudes_publicador_cron (solicitado_en)
  where revisado_en is null;

create or replace function private.encolar_publicador_cron()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  update private.solicitudes_publicador_cron as solicitud
  set respondido_en = respuesta.created,
      revisado_en = clock_timestamp(),
      status_code = respuesta.status_code,
      timed_out = respuesta.timed_out,
      error_msg = left(respuesta.error_msg, 500)
  from net._http_response as respuesta
  where respuesta.id = solicitud.request_id
    and solicitud.revisado_en is null;

  delete from private.solicitudes_publicador_cron
  where solicitado_en < clock_timestamp() - interval '90 days';

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'avansa_publicador_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'avansa_publicador_cron_secret';

  if nullif(btrim(v_url), '') is null or nullif(btrim(v_secret), '') is null then
    raise exception 'Faltan los secretos avansa_publicador_* en Supabase Vault';
  end if;

  select net.http_get(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 55000
  ) into v_request_id;

  insert into private.solicitudes_publicador_cron (request_id)
  values (v_request_id)
  on conflict (request_id) do update
  set solicitado_en = excluded.solicitado_en,
      respondido_en = null,
      revisado_en = null,
      status_code = null,
      timed_out = null,
      error_msg = null;

  return v_request_id;
end;
$$;

create or replace function private.configurar_cron_publicacion_social()
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_job_id bigint;
  v_tiene_secretos boolean := false;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'avansa-publicar-contenido'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  if to_regclass('vault.decrypted_secrets') is not null then
    select
      count(*) filter (
        where name in ('avansa_publicador_url', 'avansa_publicador_cron_secret')
          and nullif(btrim(decrypted_secret), '') is not null
      ) = 2
    into v_tiene_secretos
    from vault.decrypted_secrets;
  end if;

  if not v_tiene_secretos then
    raise notice 'Cron social no programado: faltan secretos avansa_publicador_* en Vault';
    return false;
  end if;

  perform cron.schedule(
    'avansa-publicar-contenido',
    '*/5 * * * *',
    $cron$select private.encolar_publicador_cron();$cron$
  );
  return true;
end;
$$;

revoke all on function private.encolar_publicador_cron()
  from public, anon, authenticated, service_role;
revoke all on function private.configurar_cron_publicacion_social()
  from public, anon, authenticated, service_role;

select private.configurar_cron_publicacion_social();
