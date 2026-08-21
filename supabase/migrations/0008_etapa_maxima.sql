-- ============================================================
-- avansa · Sistema Integral — 0008 · hasta dónde llegó cada expediente
-- ============================================================
-- Sin este dato el embudo no puede decir la verdad: un expediente descartado
-- salió en alguna etapa, y si sólo se mira `estado` esa salida desaparece del
-- recorrido. `etapa_maxima` guarda la etapa más lejana alcanzada y nunca
-- retrocede, así que la caída queda registrada donde de verdad ocurrió.
-- ============================================================

create or replace function public.orden_etapa(e public.lead_estado)
returns int
language sql
immutable
as $$
  select case e
    when 'nuevo' then 0 when 'contactado' then 1 when 'diagnostico' then 2
    when 'expediente' then 3 when 'revision' then 4 when 'tramite' then 5
    when 'cerrado' then 6 else -1 end
$$;

alter table public.leads
  add column if not exists etapa_maxima public.lead_estado not null default 'nuevo';

comment on column public.leads.etapa_maxima is
  'Etapa más lejana que alcanzó el expediente. Nunca retrocede; alimenta el embudo.';

create or replace function public.sellar_etapa_maxima()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.orden_etapa(new.estado) > public.orden_etapa(new.etapa_maxima) then
    new.etapa_maxima := new.estado;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_etapa_maxima on public.leads;
create trigger leads_etapa_maxima before insert or update on public.leads
  for each row execute function public.sellar_etapa_maxima();

update public.leads
set etapa_maxima = estado
where estado <> 'descartado' and public.orden_etapa(estado) > public.orden_etapa(etapa_maxima);

create or replace view public.v_embudo
with (security_invoker = true) as
select
  e.clave::public.lead_estado as etapa,
  e.orden,
  count(l.id) as alcanzaron
from (values
  ('nuevo', 0), ('contactado', 1), ('diagnostico', 2), ('expediente', 3),
  ('revision', 4), ('tramite', 5), ('cerrado', 6)
) as e(clave, orden)
left join public.leads l
  on public.orden_etapa(l.etapa_maxima) >= e.orden
group by e.clave, e.orden
order by e.orden;
