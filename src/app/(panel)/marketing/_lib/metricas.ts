import "server-only";
import { fecha } from "@/lib/formato";
import { diasDelRango, type Rango } from "@/lib/periodo";
import type { Campana } from "@/lib/supabase/tipos";
import type { LeadLigero, MetricaConCampana } from "@/lib/datos";
import type { PuntoSerie } from "@/components/graficas/Linea";

export type CampanaConsolidada = {
  id: string;
  nombre: string;
  estado: Campana["estado"];
  impresiones: number;
  alcance: number;
  clics: number;
  gasto: number;
  leads: number;
  conversaciones: number;
};

export function seriesPauta(metricas: MetricaConCampana[], rango: Rango) {
  const gasto = new Map<string, number>();
  const leads = new Map<string, number>();
  const clics = new Map<string, number>();
  for (const metrica of metricas) {
    gasto.set(metrica.fecha, (gasto.get(metrica.fecha) ?? 0) + Number(metrica.gasto));
    leads.set(metrica.fecha, (leads.get(metrica.fecha) ?? 0) + Number(metrica.leads));
    clics.set(metrica.fecha, (clics.get(metrica.fecha) ?? 0) + Number(metrica.clics));
  }
  const dias = diasDelRango(rango.desde, rango.hasta);
  const crear = (mapa: Map<string, number>): PuntoSerie[] => dias.map((dia) => ({ etiqueta: fecha(dia), valor: mapa.get(dia) ?? 0 }));
  return { gasto: crear(gasto), leads: crear(leads), clics: crear(clics) };
}

export function serieLeadsCrm(leads: LeadLigero[], rango: Rango): PuntoSerie[] {
  const conteo = new Map<string, number>();
  for (const lead of leads) {
    const dia = lead.created_at.slice(0, 10);
    conteo.set(dia, (conteo.get(dia) ?? 0) + 1);
  }
  return diasDelRango(rango.desde, rango.hasta).map((dia) => ({ etiqueta: fecha(dia), valor: conteo.get(dia) ?? 0 }));
}

export function consolidarCampanas(metricas: MetricaConCampana[]): CampanaConsolidada[] {
  const mapa = new Map<string, CampanaConsolidada>();
  for (const metrica of metricas) {
    const id = metrica.campana?.id ?? metrica.campana_id;
    const actual = mapa.get(id) ?? {
      id,
      nombre: metrica.campana?.nombre ?? "Campaña",
      estado: metrica.campana?.estado ?? "activa",
      impresiones: 0,
      alcance: 0,
      clics: 0,
      gasto: 0,
      leads: 0,
      conversaciones: 0,
    };
    actual.impresiones += Number(metrica.impresiones);
    actual.alcance += Number(metrica.alcance);
    actual.clics += Number(metrica.clics);
    actual.gasto += Number(metrica.gasto);
    actual.leads += Number(metrica.leads);
    actual.conversaciones += Number(metrica.conversaciones);
    mapa.set(id, actual);
  }
  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto);
}

export function atribucionLeads(leads: LeadLigero[], campanas: Campana[]) {
  const nombres = new Map(campanas.map((campana) => [campana.id, campana.nombre]));
  const conteo = new Map<string, number>();
  for (const lead of leads) {
    const etiqueta = lead.campana_id ? nombres.get(lead.campana_id) ?? "Campaña" : lead.origen ?? "Sin origen";
    conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([etiqueta, valor]) => ({ etiqueta, valor, color: "#FF4D6D" }))
    .sort((a, b) => b.valor - a.valor);
}

