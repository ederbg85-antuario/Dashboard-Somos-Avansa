-- ============================================================
-- avansa · ejecución frecuente de la cola social
-- ============================================================
-- Vercel Hobby sólo admite cron diario. La programación editorial necesita
-- precisión de minutos, así que Postgres invoca el endpoint protegido. Tanto
-- la URL como el bearer viven cifrados en Supabase Vault y no en cron.job.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- pg_net conserva respuestas sólo unas horas. Esta bitácora guarda únicamente
-- el identificador y el desenlace HTTP para que una falla no parezca éxito; no
-- almacena URL, headers, bearer ni cuerpo de respuesta.
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
  -- Persiste el desenlace de solicitudes anteriores antes de que pg_net borre
  -- su tabla efímera (TTL predeterminado: seis horas).
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
  -- Reconfigurar es idempotente incluso si el nombre quedó duplicado por una
  -- versión antigua de pg_cron.
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

-- Si Vault todavía no está listo la migración sí termina. Después de cargar
-- los secretos basta ejecutar esta misma función desde el SQL Editor.
select private.configurar_cron_publicacion_social();
