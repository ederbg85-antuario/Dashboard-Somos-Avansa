-- ============================================================
-- avansa · Sistema Integral — integraciones y calendario social
-- ============================================================
-- El token de Google no se expone mediante PostgREST: únicamente lo usa el
-- servicio de servidor para consultar los activos de avansa. El calendario y
-- sus archivos son privados y sólo dirección puede verlos o modificarlos.

do $$ begin
  create type public.tipo_contenido_social as enum ('publicacion', 'historia', 'reel');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_contenido_social as enum ('borrador', 'programado', 'publicando', 'publicado', 'error');
exception when duplicate_object then null; end $$;

-- Una sola conexión autorizada por el equipo. No se crean políticas: ningún
-- usuario autenticado puede leer ni escribir el refresh token por la API.
-- El callback OAuth y las consultas viven en el servidor y usan service_role.
create table if not exists public.integraciones_google (
  id             text primary key default 'principal' check (id = 'principal'),
  refresh_token  text not null,
  email          text,
  conectado_por  uuid references public.perfiles(id) on delete set null,
  conectado_en   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.integraciones_google is
  'Token OAuth de sólo lectura para GA4 y Search Console. Sin políticas RLS: sólo service_role puede tocarlo.';

alter table public.integraciones_google enable row level security;

-- Los privilegios no dependen de los auto-grants del proyecto. El navegador
-- nunca toca el refresh token; sólo los procesos privados con service_role.
revoke all on table public.integraciones_google from public, anon, authenticated;
grant select, insert, update, delete on table public.integraciones_google to service_role;

drop trigger if exists integraciones_google_touch on public.integraciones_google;
create trigger integraciones_google_touch before update on public.integraciones_google
  for each row execute function public.touch_updated_at();

create table if not exists public.contenidos_sociales (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null check (char_length(titulo) between 2 and 140),
  texto             text not null default '' check (char_length(texto) <= 5000),
  tipo              public.tipo_contenido_social not null default 'publicacion',
  plataformas       text[] not null default array['instagram']::text[]
                    check (cardinality(plataformas) > 0 and plataformas <@ array['facebook', 'instagram']::text[]),
  estado            public.estado_contenido_social not null default 'borrador',
  programado_para   timestamptz,
  publicado_en      timestamptz,
  creado_por        uuid not null references public.perfiles(id) on delete restrict,
  actualizado_por   uuid references public.perfiles(id) on delete set null,
  resultado_meta    jsonb not null default '{}'::jsonb,
  error_publicacion text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (
    (estado <> 'programado' or programado_para is not null)
    and (estado <> 'publicado' or publicado_en is not null)
  )
);

comment on table public.contenidos_sociales is
  'Calendario editorial de avansa. Publicar se habilita únicamente tras validar el acceso de Meta.';

create index if not exists contenidos_sociales_programado_idx
  on public.contenidos_sociales (programado_para asc nulls last)
  where estado in ('programado', 'publicando');

drop trigger if exists contenidos_sociales_touch on public.contenidos_sociales;
create trigger contenidos_sociales_touch before update on public.contenidos_sociales
  for each row execute function public.touch_updated_at();

create table if not exists public.contenido_medios (
  id              uuid primary key default gen_random_uuid(),
  contenido_id    uuid not null references public.contenidos_sociales(id) on delete cascade,
  storage_path    text not null unique check (char_length(storage_path) between 1 and 500),
  mime_type       text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime')),
  tipo_archivo    text not null check (tipo_archivo in ('imagen', 'video')),
  orden           smallint not null default 0 check (orden >= 0),
  created_at      timestamptz not null default now()
);

create index if not exists contenido_medios_contenido_orden_idx
  on public.contenido_medios (contenido_id, orden);

alter table public.contenidos_sociales enable row level security;
alter table public.contenido_medios enable row level security;

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

-- Los medios se suben desde el navegador con la sesión de un administrador;
-- el bucket es privado para que los archivos nunca queden indexables.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avansa-contenido',
  'avansa-contenido',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
