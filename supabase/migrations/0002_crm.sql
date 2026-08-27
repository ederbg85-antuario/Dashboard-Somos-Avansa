-- ============================================================
-- avansa · Sistema Integral — 0002 · CRM
-- ============================================================
-- `leads` es la tabla que también escribe el sitio público desde
-- `/api/leads`. Las columnas de contacto e información declarada conservan
-- exactamente el nombre que el sitio ya envía (ver web/src/lib/supabase/
-- types.ts); todo lo demás son columnas internas con valor por defecto,
-- así que el sitio inserta sin cambiar una línea de código.
-- ============================================================

-- ---------- enums --------------------------------------------------------

do $$ begin
  create type public.lead_estado as enum (
    'nuevo', 'contactado', 'diagnostico', 'expediente',
    'revision', 'tramite', 'cerrado', 'descartado'
  );
exception when duplicate_object then null; end $$;

-- Clasificación de viabilidad interna de avansa (no sustituye la
-- precalificación del Infonavit):
--   A = listo para integrar        B = viable con pendientes
--   C = bloqueo por resolver       D = fuera de alcance
do $$ begin
  create type public.lead_clasificacion as enum ('A', 'B', 'C', 'D');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.actividad_tipo as enum (
    'llamada', 'whatsapp', 'correo', 'reunion', 'nota', 'sistema'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.documento_estatus as enum (
    'pendiente', 'recibido', 'validado', 'rechazado'
  );
exception when duplicate_object then null; end $$;

-- ---------- leads --------------------------------------------------------

create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),

  -- contacto (lo escribe el sitio público)
  nombre                text not null check (char_length(nombre) between 2 and 120),
  telefono              text not null check (char_length(telefono) between 8 and 30),
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  estado_republica      text,

  -- información declarada
  -- avansa nunca consulta Infonavit ni almacena credenciales de Mi Cuenta:
  -- este saldo es el que la persona dice tener.
  saldo_subcuenta       numeric(12,2) check (saldo_subcuenta is null or saldo_subcuenta >= 0),
  tipo_mejora           text,
  vivienda_a_su_nombre  boolean,
  mensaje               text,

  -- consentimiento (obligatorio: sin él no debe existir el registro)
  acepta_privacidad     boolean not null default false check (acepta_privacidad),

  -- atribución
  origen                text default 'sitio-web',
  canal                 text,
  utm                   jsonb,
  campana_id            uuid,

  -- pipeline
  estado                public.lead_estado not null default 'nuevo',
  clasificacion         public.lead_clasificacion,
  asesor_id             uuid references public.perfiles (id) on delete set null,
  valor_estimado        numeric(12,2) check (valor_estimado is null or valor_estimado >= 0),
  probabilidad          smallint check (probabilidad is null or probabilidad between 0 and 100),
  proxima_accion        text,
  fecha_proxima_accion  date,
  motivo_descarte       text,
  cerrado_en            timestamptz,
  notas_internas        text,

  es_demo               boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.leads is
  'Formularios y contactos. Contiene datos personales: acceso sólo para el equipo autenticado.';
comment on column public.leads.saldo_subcuenta is
  'Saldo declarado por la persona. Nunca proviene de una consulta a Infonavit.';
comment on column public.leads.es_demo is
  'Marca las filas de demostración para poder borrarlas de un golpe antes de operar.';

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_estado_idx     on public.leads (estado);
create index if not exists leads_asesor_idx     on public.leads (asesor_id);
create index if not exists leads_telefono_idx   on public.leads (telefono);
create index if not exists leads_campana_idx    on public.leads (campana_id);

-- Sella la fecha de cierre sola: el margen y el embudo se calculan sobre ella
-- y nadie tiene que acordarse de escribirla a mano.
create or replace function public.sellar_cierre_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado in ('cerrado', 'descartado') and old.estado not in ('cerrado', 'descartado') then
    new.cerrado_en = coalesce(new.cerrado_en, now());
  elsif new.estado not in ('cerrado', 'descartado') then
    new.cerrado_en = null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

drop trigger if exists leads_sellar_cierre on public.leads;
create trigger leads_sellar_cierre before update on public.leads
  for each row execute function public.sellar_cierre_lead();

-- ---------- bitácora de actividades --------------------------------------

create table if not exists public.actividades (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  autor_id    uuid references public.perfiles (id) on delete set null,
  tipo        public.actividad_tipo not null default 'nota',
  titulo      text not null check (char_length(titulo) between 1 and 160),
  detalle     text,
  ocurrio_en  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists actividades_lead_idx on public.actividades (lead_id, ocurrio_en desc);

comment on table public.actividades is
  'Bitácora de cada contacto con la persona. Es la memoria del pipeline.';

-- Deja rastro automático de cada cambio de etapa: sin esto la bitácora
-- depende de que el asesor se acuerde de escribirla.
create or replace function public.registrar_cambio_de_etapa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.actividades (lead_id, autor_id, tipo, titulo, detalle)
    values (
      new.id,
      (select auth.uid()),
      'sistema',
      'Cambio de etapa: ' || old.estado || ' → ' || new.estado,
      nullif(new.motivo_descarte, '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists leads_bitacora_etapa on public.leads;
create trigger leads_bitacora_etapa after update on public.leads
  for each row execute function public.registrar_cambio_de_etapa();

-- ---------- expediente documental ----------------------------------------

create table if not exists public.documentos (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  nombre      text not null,
  grupo       text not null default 'personales',
  estatus     public.documento_estatus not null default 'pendiente',
  vence_el    date,
  url         text,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists documentos_lead_idx on public.documentos (lead_id);

drop trigger if exists documentos_touch on public.documentos;
create trigger documentos_touch before update on public.documentos
  for each row execute function public.touch_updated_at();

comment on table public.documentos is
  'Checklist del expediente por persona. `grupo` separa documentos personales de los de vivienda.';

-- ---------- RLS ----------------------------------------------------------
-- El CRM lo trabaja todo el equipo. Borrar es distinto de editar: sólo admin,
-- para que un expediente no desaparezca por un clic.

alter table public.leads       enable row level security;
alter table public.actividades enable row level security;
alter table public.documentos  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['leads', 'actividades', 'documentos'] loop
    execute format('drop policy if exists "equipo trabaja %1$s" on public.%1$I', t);
    execute format('drop policy if exists "equipo alta %1$s"    on public.%1$I', t);
    execute format('drop policy if exists "equipo edita %1$s"   on public.%1$I', t);
    execute format('drop policy if exists "admin borra %1$s"    on public.%1$I', t);

    execute format($p$
      create policy "equipo trabaja %1$s" on public.%1$I
        for select to authenticated using (public.es_equipo())
    $p$, t);
    execute format($p$
      create policy "equipo alta %1$s" on public.%1$I
        for insert to authenticated with check (public.es_equipo())
    $p$, t);
    execute format($p$
      create policy "equipo edita %1$s" on public.%1$I
        for update to authenticated using (public.es_equipo()) with check (public.es_equipo())
    $p$, t);
    execute format($p$
      create policy "admin borra %1$s" on public.%1$I
        for delete to authenticated using (public.tiene_rol('admin'))
    $p$, t);
  end loop;
end $$;
