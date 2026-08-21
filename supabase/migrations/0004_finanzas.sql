-- ============================================================
-- avansa · Sistema Integral — 0004 · finanzas
-- ============================================================
-- El panel financiero no guarda resultados: guarda movimientos. Margen
-- bruto, EBITDA y utilidad neta se derivan de la `naturaleza` de la
-- categoría de cada movimiento, así que cambiar la clasificación de un
-- gasto recalcula el estado de resultados completo sin migrar datos.
--
--   ingresos
--   − costo_directo ................. = utilidad bruta        → margen bruto
--   − operativo/marketing/admin ..... = EBITDA                → margen EBITDA
--   − depreciacion .................. = utilidad operativa (EBIT)
--   − financiero − impuestos ........ = utilidad neta         → margen neto
-- ============================================================

do $$ begin
  create type public.tipo_movimiento as enum ('ingreso', 'egreso');
exception when duplicate_object then null; end $$;

-- Dónde cae cada peso dentro de la cascada del estado de resultados.
do $$ begin
  create type public.naturaleza_cuenta as enum (
    'ingreso',
    'costo_directo',
    'gasto_operativo',
    'gasto_marketing',
    'gasto_administrativo',
    'depreciacion',
    'financiero',
    'impuestos'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estatus_movimiento as enum ('pagado', 'pendiente', 'cancelado');
exception when duplicate_object then null; end $$;

-- ---------- catálogo de categorías ---------------------------------------

create table if not exists public.categorias_finanzas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique check (char_length(nombre) between 2 and 80),
  tipo        public.tipo_movimiento not null,
  naturaleza  public.naturaleza_cuenta not null,
  color       text not null default '#6B7785',
  descripcion text,
  activo      boolean not null default true,
  orden       smallint not null default 100,
  created_at  timestamptz not null default now(),
  -- Coherencia dura: un ingreso no puede tener naturaleza de gasto.
  check (
    (tipo = 'ingreso' and naturaleza = 'ingreso') or
    (tipo = 'egreso'  and naturaleza <> 'ingreso')
  )
);

comment on table public.categorias_finanzas is
  'Plan de cuentas simplificado. `naturaleza` es lo que decide en qué renglón del estado de resultados cae el movimiento.';

-- ---------- movimientos ---------------------------------------------------

create table if not exists public.movimientos (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null default current_date,
  tipo         public.tipo_movimiento not null,
  categoria_id uuid not null references public.categorias_finanzas (id) on delete restrict,
  concepto     text not null check (char_length(concepto) between 2 and 200),
  monto        numeric(14,2) not null check (monto > 0),
  iva          numeric(14,2) not null default 0 check (iva >= 0),
  metodo_pago  text,
  referencia   text,
  estatus      public.estatus_movimiento not null default 'pagado',
  lead_id      uuid references public.leads (id) on delete set null,
  campana_id   uuid references public.campanas (id) on delete set null,
  notas        text,
  creado_por   uuid references public.perfiles (id) on delete set null,
  es_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.movimientos is
  'Ingresos y egresos. El monto se guarda sin IVA; el IVA va aparte para que los márgenes no lo incluyan.';
comment on column public.movimientos.lead_id is
  'Liga opcional al expediente que generó el ingreso. Permite calcular margen por cliente.';

create index if not exists movimientos_fecha_idx     on public.movimientos (fecha desc);
create index if not exists movimientos_categoria_idx on public.movimientos (categoria_id);
create index if not exists movimientos_lead_idx      on public.movimientos (lead_id);
create index if not exists movimientos_campana_idx   on public.movimientos (campana_id);

drop trigger if exists movimientos_touch on public.movimientos;
create trigger movimientos_touch before update on public.movimientos
  for each row execute function public.touch_updated_at();

-- Un movimiento no puede contradecir a su categoría.
create or replace function public.validar_tipo_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare tipo_cat public.tipo_movimiento;
begin
  select tipo into tipo_cat from public.categorias_finanzas where id = new.categoria_id;
  if tipo_cat is distinct from new.tipo then
    raise exception 'El movimiento es % pero la categoría es de tipo %.', new.tipo, tipo_cat;
  end if;
  return new;
end;
$$;

drop trigger if exists movimientos_validar_tipo on public.movimientos;
create trigger movimientos_validar_tipo before insert or update on public.movimientos
  for each row execute function public.validar_tipo_movimiento();

-- ---------- metas mensuales ----------------------------------------------

create table if not exists public.metas (
  id            uuid primary key default gen_random_uuid(),
  periodo       date not null unique,   -- siempre el día 1 del mes
  ingresos_meta numeric(14,2) not null default 0 check (ingresos_meta >= 0),
  leads_meta    integer       not null default 0 check (leads_meta >= 0),
  cierres_meta  integer       not null default 0 check (cierres_meta >= 0),
  cpl_meta      numeric(10,2) check (cpl_meta is null or cpl_meta >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (periodo = date_trunc('month', periodo)::date)
);

comment on table public.metas is 'Objetivo por mes. Da el denominador de los avances del tablero.';

drop trigger if exists metas_touch on public.metas;
create trigger metas_touch before update on public.metas
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------------------------------------------------------
-- Finanzas es el módulo cerrado: sólo admin y finanzas. Un asesor no ve la
-- nómina ni el margen de la empresa.

alter table public.categorias_finanzas enable row level security;
alter table public.movimientos         enable row level security;
alter table public.metas               enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categorias_finanzas', 'movimientos', 'metas'] loop
    execute format('drop policy if exists "finanzas opera %1$s" on public.%1$I', t);
    execute format($p$
      create policy "finanzas opera %1$s" on public.%1$I
        for all to authenticated
        using (public.tiene_rol('admin', 'finanzas'))
        with check (public.tiene_rol('admin', 'finanzas'))
    $p$, t);
  end loop;
end $$;

-- Las metas de leads/CPL las consulta también el equipo comercial y de
-- marketing para saber contra qué van; sólo finanzas las edita.
drop policy if exists "equipo lee metas" on public.metas;
create policy "equipo lee metas" on public.metas
  for select to authenticated using (public.es_equipo());
