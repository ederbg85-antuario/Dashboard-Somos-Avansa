-- ============================================================
-- avansa · Sistema Integral — 0005 · vistas de tablero
-- ============================================================
-- Todas con `security_invoker = true`: la vista se ejecuta con los permisos
-- de quien consulta, no de quien la creó. Un asesor que consulte una vista
-- financiera obtiene cero filas, no los números de la empresa.
-- ============================================================

-- ---------- pipeline comercial -------------------------------------------

create or replace view public.v_pipeline
with (security_invoker = true) as
select
  estado,
  count(*)                                             as total,
  coalesce(sum(valor_estimado), 0)                     as valor_estimado,
  coalesce(sum(valor_estimado * probabilidad / 100.0), 0) as valor_ponderado,
  count(*) filter (where clasificacion = 'A')          as clasificacion_a
from public.leads
group by estado;

-- ---------- entrada de leads por día -------------------------------------

create or replace view public.v_leads_diario
with (security_invoker = true) as
select
  created_at::date        as dia,
  coalesce(origen, 'sin origen') as origen,
  count(*)                as total,
  count(*) filter (where estado = 'cerrado')    as cerrados,
  count(*) filter (where estado = 'descartado') as descartados,
  avg(saldo_subcuenta)    as saldo_promedio
from public.leads
group by 1, 2;

-- ---------- desempeño de pauta -------------------------------------------
-- Los derivados se calculan aquí y no se guardan: un dato corregido por Meta
-- se arregla reescribiendo la fila del día, sin recalcular nada más.

create or replace view public.v_marketing_campana
with (security_invoker = true) as
select
  c.id            as campana_id,
  c.nombre,
  c.estado,
  c.objetivo,
  c.fecha_inicio,
  c.fecha_fin,
  c.presupuesto_diario,
  coalesce(sum(m.impresiones), 0) as impresiones,
  coalesce(sum(m.alcance), 0)     as alcance,
  coalesce(sum(m.clics), 0)       as clics,
  coalesce(sum(m.gasto), 0)       as gasto,
  coalesce(sum(m.leads), 0)       as leads,
  coalesce(sum(m.conversaciones), 0) as conversaciones,
  case when sum(m.impresiones) > 0
       then round(sum(m.clics)::numeric * 100 / sum(m.impresiones), 2) end as ctr,
  case when sum(m.clics) > 0
       then round(sum(m.gasto) / sum(m.clics), 2) end as cpc,
  case when sum(m.impresiones) > 0
       then round(sum(m.gasto) * 1000 / sum(m.impresiones), 2) end as cpm,
  case when sum(m.leads) > 0
       then round(sum(m.gasto) / sum(m.leads), 2) end as cpl
from public.campanas c
left join public.metricas_campana m on m.campana_id = c.id
group by c.id;

-- ---------- estado de resultados por mes ---------------------------------
-- La misma cascada que calcula la aplicación, disponible en SQL para
-- reportes, exportaciones y auditoría. Los movimientos cancelados y los
-- pendientes no cuentan: sólo lo efectivamente cobrado o pagado.

create or replace view public.v_estado_resultados_mensual
with (security_invoker = true) as
with base as (
  select
    date_trunc('month', m.fecha)::date as periodo,
    c.naturaleza,
    sum(m.monto) as total
  from public.movimientos m
  join public.categorias_finanzas c on c.id = m.categoria_id
  where m.estatus = 'pagado'
  group by 1, 2
),
pivote as (
  select
    periodo,
    coalesce(sum(total) filter (where naturaleza = 'ingreso'), 0)              as ingresos,
    coalesce(sum(total) filter (where naturaleza = 'costo_directo'), 0)        as costo_directo,
    coalesce(sum(total) filter (where naturaleza = 'gasto_operativo'), 0)      as gasto_operativo,
    coalesce(sum(total) filter (where naturaleza = 'gasto_marketing'), 0)      as gasto_marketing,
    coalesce(sum(total) filter (where naturaleza = 'gasto_administrativo'), 0) as gasto_administrativo,
    coalesce(sum(total) filter (where naturaleza = 'depreciacion'), 0)         as depreciacion,
    coalesce(sum(total) filter (where naturaleza = 'financiero'), 0)           as financiero,
    coalesce(sum(total) filter (where naturaleza = 'impuestos'), 0)            as impuestos
  from base
  group by periodo
)
select
  p.*,
  (p.ingresos - p.costo_directo) as utilidad_bruta,
  (p.gasto_operativo + p.gasto_marketing + p.gasto_administrativo) as gastos_operativos,
  (p.ingresos - p.costo_directo - p.gasto_operativo - p.gasto_marketing - p.gasto_administrativo) as ebitda,
  (p.ingresos - p.costo_directo - p.gasto_operativo - p.gasto_marketing - p.gasto_administrativo - p.depreciacion) as utilidad_operativa,
  (p.ingresos - p.costo_directo - p.gasto_operativo - p.gasto_marketing - p.gasto_administrativo - p.depreciacion - p.financiero - p.impuestos) as utilidad_neta,
  case when p.ingresos > 0
       then round((p.ingresos - p.costo_directo) * 100 / p.ingresos, 2) end as margen_bruto,
  case when p.ingresos > 0
       then round((p.ingresos - p.costo_directo - p.gasto_operativo - p.gasto_marketing - p.gasto_administrativo) * 100 / p.ingresos, 2) end as margen_ebitda,
  case when p.ingresos > 0
       then round((p.ingresos - p.costo_directo - p.gasto_operativo - p.gasto_marketing - p.gasto_administrativo - p.depreciacion - p.financiero - p.impuestos) * 100 / p.ingresos, 2) end as margen_neto
from pivote p
order by periodo desc;

comment on view public.v_estado_resultados_mensual is
  'Cascada del estado de resultados por mes. Espejo en SQL de lib/finanzas.ts.';
