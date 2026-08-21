-- ============================================================
-- avansa · Sistema Integral — 0010 · cerrar la superficie pública
-- ============================================================
-- Supabase publica **toda** función del esquema `public` como endpoint REST
-- en `/rest/v1/rpc/<nombre>`. Las funciones de trigger no tienen por qué
-- estar ahí: no son API, y aunque llamarlas sueltas falla (no existe `NEW`
-- fuera de un trigger), no hay razón para dejarlas asomadas.
--
-- Revocar EXECUTE no rompe los triggers: Postgres no comprueba ese permiso
-- al dispararlos, sólo al crearlos.
-- ============================================================

do $$
declare f text;
begin
  foreach f in array array[
    'public.touch_updated_at()',
    'public.proteger_rol()',
    'public.crear_perfil_para_usuario()',
    'public.sellar_cierre_lead()',
    'public.sellar_etapa_maxima()',
    'public.registrar_cambio_de_etapa()',
    'public.validar_tipo_movimiento()'
  ] loop
    execute format('revoke all on function %s from anon, authenticated, public', f);
  end loop;
end $$;

-- Los helpers de autorización los necesita `authenticated`: las políticas RLS
-- se evalúan con los permisos de quien consulta. `anon` no evalúa ninguna
-- política, así que no tiene nada que hacer con ellos.
revoke all on function public.mi_rol() from anon, public;
revoke all on function public.es_equipo() from anon, public;
revoke all on function public.tiene_rol(variadic public.rol_usuario[]) from anon, public;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.es_equipo() to authenticated;
grant execute on function public.tiene_rol(variadic public.rol_usuario[]) to authenticated;

-- `hay_equipo` sí es pública a propósito: la pantalla de acceso la consulta
-- sin sesión para saber si ofrecer «crear la primera cuenta». Devuelve un
-- booleano y nada más.
grant execute on function public.hay_equipo() to anon, authenticated;

-- `orden_etapa` es inmutable y sólo hace un CASE sobre un enum, pero sin
-- `search_path` fijo un rol podría anteponer un esquema propio.
create or replace function public.orden_etapa(e public.lead_estado)
returns int
language sql
immutable
set search_path = ''
as $$
  select case e
    when 'nuevo' then 0 when 'contactado' then 1 when 'diagnostico' then 2
    when 'expediente' then 3 when 'revision' then 4 when 'tramite' then 5
    when 'cerrado' then 6 else -1 end
$$;
