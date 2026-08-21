-- ============================================================
-- avansa · Sistema Integral — 0001 · base, roles y perfiles
-- ============================================================
-- Todo el sistema cuelga de `auth.users`. Cada persona del equipo tiene
-- exactamente una fila en `public.perfiles`, creada por trigger al darse de
-- alta, y su `rol` decide qué módulos ve y qué tablas puede tocar.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- enums --------------------------------------------------------

do $$ begin
  create type public.rol_usuario as enum ('admin', 'asesor', 'marketing', 'finanzas');
exception when duplicate_object then null; end $$;

-- ---------- perfiles del equipo -----------------------------------------

create table if not exists public.perfiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null default 'Sin nombre',
  email       text not null,
  telefono    text,
  rol         public.rol_usuario not null default 'asesor',
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.perfiles is
  'Equipo interno de avansa. Una fila por usuario de auth; el rol gobierna el acceso.';

create index if not exists perfiles_rol_idx on public.perfiles (rol);

-- ---------- updated_at automático ---------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists perfiles_touch on public.perfiles;
create trigger perfiles_touch before update on public.perfiles
  for each row execute function public.touch_updated_at();

-- ---------- alta automática de perfil ------------------------------------
-- La primera persona que se registra queda como `admin`: si no, nadie podría
-- repartir permisos y el sistema nacería bloqueado. El resto entra como
-- `asesor` y un admin lo reasigna desde el módulo de Equipo.

create or replace function public.crear_perfil_para_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_primero boolean;
begin
  select count(*) = 0 into es_primero from public.perfiles;

  insert into public.perfiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nombre', ''), split_part(new.email, '@', 1)),
    new.email,
    case
      when es_primero then 'admin'::public.rol_usuario
      when (new.raw_user_meta_data ->> 'rol') in ('admin','asesor','marketing','finanzas')
        then (new.raw_user_meta_data ->> 'rol')::public.rol_usuario
      else 'asesor'::public.rol_usuario
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_para_usuario();

-- ---------- helpers de autorización --------------------------------------
-- `security definer` a propósito: leen `perfiles` saltándose RLS, lo que evita
-- la recursión infinita de una política que consulta su propia tabla.

create or replace function public.mi_rol()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.perfiles where id = (select auth.uid()) and activo
$$;

create or replace function public.tiene_rol(variadic roles public.rol_usuario[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.mi_rol() = any (roles), false)
$$;

/** `true` para cualquier miembro activo del equipo. */
create or replace function public.es_equipo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles where id = (select auth.uid()) and activo
  )
$$;

-- ---------- RLS de perfiles ----------------------------------------------

alter table public.perfiles enable row level security;

drop policy if exists "equipo ve al equipo"        on public.perfiles;
drop policy if exists "cada quien edita lo suyo"   on public.perfiles;
drop policy if exists "admin administra perfiles"  on public.perfiles;

create policy "equipo ve al equipo"
  on public.perfiles for select to authenticated
  using (public.es_equipo() or id = (select auth.uid()));

create policy "cada quien edita lo suyo"
  on public.perfiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "admin administra perfiles"
  on public.perfiles for all to authenticated
  using (public.tiene_rol('admin'))
  with check (public.tiene_rol('admin'));

-- ---------- candado contra escalada de privilegios -----------------------
-- La política de arriba deja que cada quien edite su propia fila (nombre,
-- teléfono). Sin este trigger, también podría ascenderse a `admin`.

create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.rol is distinct from old.rol or new.activo is distinct from old.activo)
     and not public.tiene_rol('admin') then
    raise exception 'Sólo un administrador puede cambiar el rol o dar de baja a alguien.';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_rol on public.perfiles;
create trigger perfiles_proteger_rol before update on public.perfiles
  for each row execute function public.proteger_rol();
