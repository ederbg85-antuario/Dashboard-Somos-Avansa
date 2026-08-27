-- ============================================================
-- avansa · ajustes posteriores a Security/Performance Advisor
-- ============================================================

begin;

-- El guard de perfil ya no depende de helpers legacy expuestos por Data API.
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

revoke all on function public.proteger_perfil()
  from public, anon, authenticated, service_role;
revoke all on function public.hay_equipo()
  from public, anon, authenticated, service_role;
revoke all on function public.mi_rol()
  from public, anon, authenticated, service_role;
revoke all on function public.es_equipo()
  from public, anon, authenticated, service_role;
revoke all on function public.tiene_rol(variadic public.rol_usuario[])
  from public, anon, authenticated, service_role;

create index if not exists accesos_nss_usuario_idx
  on private.accesos_nss (usuario_id);
create index if not exists asignaciones_asesor_idx
  on private.asignaciones (asesor_id);
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

drop policy if exists "admin ve perfiles" on public.perfiles;
drop policy if exists "cada persona ve su perfil" on public.perfiles;
drop policy if exists "cada persona edita su perfil" on public.perfiles;
drop policy if exists "admin administra perfiles" on public.perfiles;
drop policy if exists "usuarios ven perfiles permitidos" on public.perfiles;
drop policy if exists "usuarios actualizan perfiles permitidos" on public.perfiles;
create policy "usuarios ven perfiles permitidos"
  on public.perfiles for select to authenticated
  using (private.es_admin() or id = (select auth.uid()));
create policy "usuarios actualizan perfiles permitidos"
  on public.perfiles for update to authenticated
  using (private.es_admin() or id = (select auth.uid()))
  with check (private.es_admin() or id = (select auth.uid()));

drop policy if exists "admin administra conversaciones" on public.conversaciones;

commit;
