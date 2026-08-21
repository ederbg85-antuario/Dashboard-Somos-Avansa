import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { finDelDia, inicioDelDia } from "@/lib/formato";
import type {
  Campana, CategoriaFinanzas, Lead, LeadEstado, MetricaCampana,
  Movimiento, NaturalezaCuenta, Perfil,
} from "@/lib/supabase/tipos";

/**
 * Consultas compartidas.
 *
 * Aquí vive todo lo que más de una pantalla necesita — sobre todo el cruce de
 * movimientos con la naturaleza de su categoría, que es lo que alimenta el
 * estado de resultados. Cada función recibe ya el rango resuelto y devuelve
 * filas planas: la agregación se hace en TypeScript para que exista una sola
 * definición de margen (`lib/finanzas.ts`) y no dos que se desincronicen.
 *
 * Ninguna función pasa por alto RLS: todas usan la sesión de la persona.
 */

// ---------- CRM -----------------------------------------------------------

export type LeadLigero = Pick<
  Lead,
  "id" | "nombre" | "telefono" | "email" | "estado" | "etapa_maxima" | "clasificacion" | "origen"
  | "created_at" | "valor_estimado" | "probabilidad" | "saldo_subcuenta"
  | "estado_republica" | "tipo_mejora" | "asesor_id" | "campana_id"
  | "fecha_proxima_accion" | "proxima_accion" | "cerrado_en" | "es_demo"
>;

const CAMPOS_LIGEROS =
  "id, nombre, telefono, email, estado, etapa_maxima, clasificacion, origen, created_at, " +
  "valor_estimado, probabilidad, saldo_subcuenta, estado_republica, tipo_mejora, " +
  "asesor_id, campana_id, fecha_proxima_accion, proxima_accion, cerrado_en, es_demo";

/** Leads *creados* dentro del rango. */
export async function leadsCreados(desde: string, hasta: string): Promise<LeadLigero[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("leads")
    .select(CAMPOS_LIGEROS)
    .gte("created_at", inicioDelDia(desde))
    .lte("created_at", finDelDia(hasta))
    .order("created_at", { ascending: false });
  return (data as unknown as LeadLigero[]) ?? [];
}

/** Leads *cerrados* (ganados o descartados) dentro del rango. */
export async function leadsCerrados(desde: string, hasta: string): Promise<LeadLigero[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("leads")
    .select(CAMPOS_LIGEROS)
    .not("cerrado_en", "is", null)
    .gte("cerrado_en", inicioDelDia(desde))
    .lte("cerrado_en", finDelDia(hasta));
  return (data as unknown as LeadLigero[]) ?? [];
}

/** Todo el pipeline vivo, sin filtro de fecha: un expediente abierto no caduca. */
export async function pipelineCompleto(): Promise<LeadLigero[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("leads")
    .select(CAMPOS_LIGEROS)
    .order("created_at", { ascending: false });
  return (data as unknown as LeadLigero[]) ?? [];
}

/** Conteo por etapa a partir de una lista ya cargada. */
export function contarPorEtapa(leads: LeadLigero[]): Record<LeadEstado, number> {
  const base = {
    nuevo: 0, contactado: 0, diagnostico: 0, expediente: 0,
    revision: 0, tramite: 0, cerrado: 0, descartado: 0,
  } as Record<LeadEstado, number>;
  for (const l of leads) base[l.estado] += 1;
  return base;
}

// ---------- finanzas ------------------------------------------------------

/** Un movimiento con la naturaleza contable de su categoría ya resuelta. */
export type MovimientoConCuenta = Movimiento & {
  categoria: Pick<CategoriaFinanzas, "id" | "nombre" | "naturaleza" | "color" | "tipo"> | null;
};

export async function movimientosEnRango(
  desde: string,
  hasta: string,
): Promise<MovimientoConCuenta[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("movimientos")
    .select("*, categoria:categorias_finanzas(id, nombre, naturaleza, color, tipo)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false });
  return (data as unknown as MovimientoConCuenta[]) ?? [];
}

/** Los movimientos en la forma que espera `lib/finanzas.ts`. */
export const contables = (movimientos: MovimientoConCuenta[]) =>
  movimientos
    .filter((m) => m.categoria)
    .map((m) => ({
      monto: Number(m.monto),
      naturaleza: m.categoria!.naturaleza as NaturalezaCuenta,
      estatus: m.estatus,
      fecha: m.fecha,
    }));

export async function categorias(): Promise<CategoriaFinanzas[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("categorias_finanzas")
    .select("*")
    .order("orden");
  return data ?? [];
}

// ---------- marketing -----------------------------------------------------

export type MetricaConCampana = MetricaCampana & {
  campana: Pick<Campana, "id" | "nombre" | "estado" | "objetivo"> | null;
};

export async function metricasEnRango(
  desde: string,
  hasta: string,
): Promise<MetricaConCampana[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("metricas_campana")
    .select("*, campana:campanas(id, nombre, estado, objetivo)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });
  return (data as unknown as MetricaConCampana[]) ?? [];
}

export async function campanas(): Promise<Campana[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("campanas")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Suma de métricas de pauta, con los derivados ya calculados. */
export function totalizarPauta(metricas: { impresiones: number; clics: number; gasto: number; leads: number; alcance: number; conversaciones: number }[]) {
  const t = metricas.reduce(
    (a, m) => ({
      impresiones: a.impresiones + Number(m.impresiones),
      alcance: a.alcance + Number(m.alcance),
      clics: a.clics + Number(m.clics),
      gasto: a.gasto + Number(m.gasto),
      leads: a.leads + Number(m.leads),
      conversaciones: a.conversaciones + Number(m.conversaciones),
    }),
    { impresiones: 0, alcance: 0, clics: 0, gasto: 0, leads: 0, conversaciones: 0 },
  );

  return {
    ...t,
    ctr: t.impresiones > 0 ? (t.clics * 100) / t.impresiones : null,
    cpc: t.clics > 0 ? t.gasto / t.clics : null,
    cpm: t.impresiones > 0 ? (t.gasto * 1000) / t.impresiones : null,
    cpl: t.leads > 0 ? t.gasto / t.leads : null,
  };
}

// ---------- equipo --------------------------------------------------------

export async function equipo(): Promise<Perfil[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .order("rol")
    .order("nombre");
  return data ?? [];
}

/** Diccionario id → nombre, para pintar el asesor sin un join por fila. */
export async function nombresDelEquipo(): Promise<Map<string, Perfil>> {
  return new Map((await equipo()).map((p) => [p.id, p]));
}

// ---------- metas ---------------------------------------------------------

export async function metaDelMes(periodo: string) {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("metas")
    .select("*")
    .eq("periodo", periodo)
    .maybeSingle();
  return data;
}
