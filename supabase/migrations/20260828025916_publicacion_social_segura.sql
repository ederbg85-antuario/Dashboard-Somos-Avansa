-- ============================================================
-- avansa · cola segura de publicacion organica en Meta
-- ============================================================
-- Guardar una fecha no basta para publicar. La fila necesita una aprobacion
-- explicita de un administrador; asi, conectar credenciales en produccion no
-- vacia por accidente todo el calendario historico.

alter table public.contenidos_sociales
  add column if not exists autorizado_en timestamptz,
  add column if not exists autorizado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists publicacion_intentos smallint not null default 0,
  add column if not exists siguiente_intento_en timestamptz,
  add column if not exists bloqueado_hasta timestamptz,
  add column if not exists lease_token uuid;

comment on column public.contenidos_sociales.autorizado_en is
  'Aprobacion humana explicita. El cron ignora toda fila donde sea null.';
comment on column public.contenidos_sociales.resultado_meta is
  'Estado por plataforma e identificadores externos; permite reanudar sin duplicar envios.';
comment on column public.contenidos_sociales.bloqueado_hasta is
  'Lease corto del trabajador que reclama la pieza. Evita dos publicaciones concurrentes.';
comment on column public.contenidos_sociales.lease_token is
  'Token de fencing del trabajador. Toda escritura de la cola debe presentar el token vigente.';

-- Una ejecución previa a esta migración no posee token de fencing. Reintentarla
-- automáticamente podría duplicar una publicación cuyo resultado fue ambiguo.
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

do $$ begin
  alter table public.contenidos_sociales
    add constraint contenidos_sociales_autorizacion_completa_check check (
      autorizado_en is null
      or (autorizado_por is not null and programado_para is not null)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contenidos_sociales
    add constraint contenidos_sociales_intentos_check
    check (publicacion_intentos between 0 and 50);
exception when duplicate_object then null; end $$;

do $$ begin
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
exception when duplicate_object then null; end $$;

-- Cambiar el material o sus datos publicables invalida la aprobación previa.
-- El touch trigger también mueve updated_at, que el servidor usa como CAS al
-- autorizar para detectar un archivo cambiado durante la validación externa.
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

-- Reclamo atómico y acotado a service_role. Repite todos los predicados que
-- hacen publicable a la candidatura para cerrar la ventana SELECT -> UPDATE.
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

create index if not exists contenidos_sociales_cola_publicacion_idx
  on public.contenidos_sociales (programado_para, siguiente_intento_en)
  where estado in ('programado', 'publicando') and autorizado_en is not null;

create index if not exists contenidos_sociales_autorizado_por_idx
  on public.contenidos_sociales (autorizado_por)
  where autorizado_por is not null;
