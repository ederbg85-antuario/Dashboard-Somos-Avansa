-- ============================================================
-- avansa · Sistema Integral — 0007 · invitaciones de acceso
-- ============================================================
-- Esta migración ya está aplicada en producción. Se conserva en el repositorio
-- para que una instalación nueva pueda reconstruir el mismo esquema antes de
-- ejecutar las migraciones posteriores.
-- ============================================================

create table if not exists public.invitaciones (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique
                check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  nombre        text,
  rol           public.rol_usuario not null default 'asesor',
  invitada_por  uuid references public.perfiles(id) on delete set null,
  usada_en      timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.invitaciones enable row level security;

drop policy if exists "admin administra invitaciones" on public.invitaciones;
create policy "admin administra invitaciones"
  on public.invitaciones for all to authenticated
  using (public.tiene_rol('admin'))
  with check (public.tiene_rol('admin'));

create or replace function public.hay_equipo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles)
$$;

revoke all on function public.hay_equipo() from public;
grant execute on function public.hay_equipo() to anon, authenticated;

create or replace function public.crear_perfil_para_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_primero boolean;
  invitacion public.invitaciones%rowtype;
  rol_final public.rol_usuario;
  nombre_final text;
begin
  select count(*) = 0 into es_primero from public.perfiles;

  select * into invitacion
  from public.invitaciones
  where lower(email) = lower(new.email)
    and usada_en is null;

  if es_primero then
    rol_final := 'admin';
  elsif invitacion.id is not null then
    rol_final := invitacion.rol;
  else
    raise exception 'Este correo no tiene una invitación vigente.';
  end if;

  nombre_final := coalesce(
    nullif(new.raw_user_meta_data ->> 'nombre', ''),
    nullif(invitacion.nombre, ''),
    split_part(new.email, '@', 1)
  );

  insert into public.perfiles (id, nombre, email, rol)
  values (new.id, nombre_final, new.email, rol_final)
  on conflict (id) do nothing;

  if invitacion.id is not null then
    update public.invitaciones set usada_en = now() where id = invitacion.id;
  end if;

  return new;
end;
$$;
