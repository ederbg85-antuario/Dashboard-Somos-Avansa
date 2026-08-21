-- ============================================================
-- avansa · Sistema Integral — 0003 · marketing (Meta Ads)
-- ============================================================
-- Dos tablas: la campaña (que cambia poco) y su métrica diaria (que es lo
-- que crece). La métrica se guarda cruda — impresiones, clics, gasto — y
-- todo lo derivado (CTR, CPC, CPM, CPL) se calcula al leer: si Meta corrige
-- un dato histórico, basta reescribir la fila del día.
-- ============================================================

do $$ begin
  create type public.campana_estado as enum ('borrador', 'activa', 'pausada', 'finalizada');
exception when duplicate_object then null; end $$;

create table if not exists public.campanas (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (char_length(nombre) between 2 and 160),
  plataforma         text not null default 'meta',
  meta_campaign_id   text unique,
  objetivo           text,
  estado             public.campana_estado not null default 'activa',
  publico            text,
  fecha_inicio       date,
  fecha_fin          date,
  presupuesto_diario numeric(12,2) check (presupuesto_diario is null or presupuesto_diario >= 0),
  notas              text,
  es_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio)
);

comment on table public.campanas is
  'Campañas de pauta. `meta_campaign_id` permite sincronizar después con la Marketing API sin duplicar filas.';

drop trigger if exists campanas_touch on public.campanas;
create trigger campanas_touch before update on public.campanas
  for each row execute function public.touch_updated_at();

-- El lead trae la campaña que lo trajo; se declara aquí porque `leads` nace
-- antes que `campanas` en el orden de migraciones.
do $$ begin
  alter table public.leads
    add constraint leads_campana_fk
    foreign key (campana_id) references public.campanas (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.metricas_campana (
  id             uuid primary key default gen_random_uuid(),
  campana_id     uuid not null references public.campanas (id) on delete cascade,
  fecha          date not null,
  impresiones    bigint  not null default 0 check (impresiones >= 0),
  alcance        bigint  not null default 0 check (alcance >= 0),
  clics          bigint  not null default 0 check (clics >= 0),
  gasto          numeric(12,2) not null default 0 check (gasto >= 0),
  leads          integer not null default 0 check (leads >= 0),
  conversaciones integer not null default 0 check (conversaciones >= 0),
  es_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (campana_id, fecha)
);

comment on table public.metricas_campana is
  'Una fila por campaña y día. La clave única (campana_id, fecha) permite reimportar con upsert sin duplicar.';

create index if not exists metricas_fecha_idx on public.metricas_campana (fecha desc);

drop trigger if exists metricas_touch on public.metricas_campana;
create trigger metricas_touch before update on public.metricas_campana
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------------------------------------------------------
-- Todo el equipo lee marketing (el asesor necesita saber de dónde viene su
-- lead); escriben admin y marketing.

alter table public.campanas          enable row level security;
alter table public.metricas_campana  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['campanas', 'metricas_campana'] loop
    execute format('drop policy if exists "equipo lee %1$s"       on public.%1$I', t);
    execute format('drop policy if exists "marketing escribe %1$s" on public.%1$I', t);

    execute format($p$
      create policy "equipo lee %1$s" on public.%1$I
        for select to authenticated using (public.es_equipo())
    $p$, t);
    execute format($p$
      create policy "marketing escribe %1$s" on public.%1$I
        for all to authenticated
        using (public.tiene_rol('admin', 'marketing'))
        with check (public.tiene_rol('admin', 'marketing'))
    $p$, t);
  end loop;
end $$;
