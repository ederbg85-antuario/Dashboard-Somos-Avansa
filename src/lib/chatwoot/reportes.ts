import "server-only";

import { bandejaId, ErrorChatwoot, hayChatwoot } from "./cliente";

/**
 * Cliente de los reportes oficiales de Chatwoot.
 *
 * Estos endpoints tienen un alcance distinto al de la bandeja: el resumen y
 * la serie se cierran sobre `CHATWOOT_BANDEJA_ID`, mientras que el reporte
 * agrupado por agente abarca toda la cuenta (la API de Chatwoot no acepta un
 * filtro de bandeja en ese endpoint). Quien presenta los datos debe conservar
 * esa diferencia; un agente técnico de Chatwoot no equivale a un asesor del
 * CRM.
 */

const URL_BASE = process.env.CHATWOOT_URL?.replace(/\/+$/, "");
const TOKEN = process.env.CHATWOOT_TOKEN;
const CUENTA = process.env.CHATWOOT_CUENTA_ID;
const MAX_PAGINAS_EVENTOS = 20;

export type MetricaReporteChatwoot =
  | "conversations_count"
  | "incoming_messages_count"
  | "outgoing_messages_count"
  | "avg_first_response_time"
  | "avg_resolution_time"
  | "resolutions_count";

export type ResumenBandejaChatwoot = {
  conversaciones: number;
  mensajesEntrantes: number;
  mensajesSalientes: number;
  resoluciones: number;
  primeraRespuestaSegundos: number | null;
  resolucionSegundos: number | null;
};

export type PuntoReporteChatwoot = {
  timestamp: number;
  valor: number;
};

export type ReporteAgenteChatwoot = {
  id: number;
  conversaciones: number;
  resoluciones: number;
  primeraRespuestaSegundos: number | null;
  resolucionSegundos: number | null;
  respuestaSegundos: number | null;
};

export type AgenteChatwoot = {
  id: number;
  nombre: string;
  email: string | null;
};

export type EventoReporteChatwoot = {
  id: number;
  nombre: string;
  valorSegundos: number;
  inicio: string | null;
  fin: string | null;
  conversacionId: number | null;
  bandejaId: number | null;
  agenteId: number | null;
};

export type PaginaEventosChatwoot = {
  eventos: EventoReporteChatwoot[];
  truncado: boolean;
};

function numeroSeguro(valor: unknown): number | null {
  if (typeof valor !== "number" && (typeof valor !== "string" || !valor.trim())) return null;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function enteroPositivo(valor: unknown): number | null {
  const numero = numeroSeguro(valor);
  return numero !== null && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function instanteIso(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const tiempo = new Date(valor).getTime();
  return Number.isFinite(tiempo) ? valor : null;
}

function unix(iso: string): string {
  return String(Math.floor(new Date(iso).getTime() / 1000));
}

async function pedirReporte<T>(version: "v1" | "v2", ruta: string): Promise<T> {
  if (!hayChatwoot || !URL_BASE || !TOKEN || !CUENTA) {
    throw new ErrorChatwoot(503, "Los reportes de Chatwoot no están configurados.");
  }

  const respuesta = await fetch(`${URL_BASE}/api/${version}/accounts/${CUENTA}${ruta}`, {
    headers: {
      "Content-Type": "application/json",
      api_access_token: TOKEN,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!respuesta.ok) {
    throw new ErrorChatwoot(
      respuesta.status,
      `Chatwoot respondió ${respuesta.status} al consultar sus informes.`,
    );
  }

  return respuesta.json() as Promise<T>;
}

function parametrosRango(desde: string, hasta: string) {
  return {
    since: unix(desde),
    until: unix(hasta),
  };
}

/** Resumen oficial del periodo, limitado a la bandeja configurada. */
export async function resumenBandeja(
  desde: string,
  hasta: string,
): Promise<ResumenBandejaChatwoot> {
  const busca = new URLSearchParams({
    type: "inbox",
    id: String(bandejaId),
    ...parametrosRango(desde, hasta),
  });
  const r = await pedirReporte<Record<string, unknown>>("v2", `/reports/summary?${busca}`);

  return {
    conversaciones: numeroSeguro(r.conversations_count) ?? 0,
    mensajesEntrantes: numeroSeguro(r.incoming_messages_count) ?? 0,
    mensajesSalientes: numeroSeguro(r.outgoing_messages_count) ?? 0,
    resoluciones: numeroSeguro(r.resolutions_count) ?? 0,
    primeraRespuestaSegundos: numeroSeguro(r.avg_first_response_time),
    resolucionSegundos: numeroSeguro(r.avg_resolution_time),
  };
}

/** Serie oficial de una métrica, limitada a la bandeja configurada. */
export async function serieBandeja(
  metrica: MetricaReporteChatwoot,
  desde: string,
  hasta: string,
): Promise<PuntoReporteChatwoot[]> {
  const busca = new URLSearchParams({
    type: "inbox",
    id: String(bandejaId),
    metric: metrica,
    ...parametrosRango(desde, hasta),
  });
  const r = await pedirReporte<unknown[]>("v2", `/reports?${busca}`);

  return (Array.isArray(r) ? r : []).flatMap((punto) => {
    if (!punto || typeof punto !== "object") return [];
    const fila = punto as Record<string, unknown>;
    const timestamp = numeroSeguro(fila.timestamp);
    const valor = numeroSeguro(fila.value);
    return timestamp === null || valor === null ? [] : [{ timestamp, valor }];
  });
}

/**
 * Resumen agrupado por identidad de Chatwoot. El alcance es la cuenta
 * completa porque este endpoint no ofrece `inbox_id`.
 */
export async function resumenPorAgente(
  desde: string,
  hasta: string,
): Promise<ReporteAgenteChatwoot[]> {
  const busca = new URLSearchParams(parametrosRango(desde, hasta));
  const r = await pedirReporte<unknown[]>("v2", `/summary_reports/agent?${busca}`);

  return (Array.isArray(r) ? r : []).flatMap((agente) => {
    if (!agente || typeof agente !== "object") return [];
    const fila = agente as Record<string, unknown>;
    const id = enteroPositivo(fila.id);
    if (id === null) return [];
    return [{
      id,
      conversaciones: numeroSeguro(fila.conversations_count) ?? 0,
      resoluciones: numeroSeguro(fila.resolved_conversations_count) ?? 0,
      primeraRespuestaSegundos: numeroSeguro(fila.avg_first_response_time),
      resolucionSegundos: numeroSeguro(fila.avg_resolution_time),
      respuestaSegundos: numeroSeguro(fila.avg_reply_time),
    }];
  });
}

/** Identidades de Chatwoot para rotular el reporte técnico, no el CRM. */
export async function agentesCuenta(): Promise<AgenteChatwoot[]> {
  const r = await pedirReporte<unknown[]>("v1", "/agents");
  return (Array.isArray(r) ? r : []).flatMap((agente) => {
    if (!agente || typeof agente !== "object") return [];
    const fila = agente as Record<string, unknown>;
    const id = enteroPositivo(fila.id);
    if (id === null) return [];
    const nombre = typeof fila.name === "string" && fila.name.trim()
      ? fila.name.trim()
      : `Agente ${id}`;
    return [{
      id,
      nombre,
      email: typeof fila.email === "string" ? fila.email : null,
    }];
  });
}

/**
 * Eventos oficiales de respuesta/resolución de la bandeja. El endpoint sólo
 * está disponible para administradores de Chatwoot y pagina de 25 en 25.
 * El llamador debe intersectarlos con conversaciones obtenidas mediante RLS
 * antes de atribuir cualquier evento a una persona del CRM.
 */
export async function eventosBandeja(
  desde: string,
  hasta: string,
): Promise<PaginaEventosChatwoot> {
  const acumulados: EventoReporteChatwoot[] = [];
  let truncado = false;

  for (let pagina = 1; pagina <= MAX_PAGINAS_EVENTOS; pagina += 1) {
    const busca = new URLSearchParams({
      page: String(pagina),
      inbox_id: String(bandejaId),
      ...parametrosRango(desde, hasta),
    });
    const r = await pedirReporte<{
      meta?: { total_pages?: unknown };
      payload?: unknown[];
    }>("v1", `/reporting_events?${busca}`);

    for (const evento of Array.isArray(r.payload) ? r.payload : []) {
      if (!evento || typeof evento !== "object") continue;
      const fila = evento as Record<string, unknown>;
      const id = enteroPositivo(fila.id);
      const nombre = typeof fila.name === "string" ? fila.name : null;
      const valor = numeroSeguro(fila.value);
      if (id === null || !nombre || valor === null) continue;
      acumulados.push({
        id,
        nombre,
        valorSegundos: valor,
        inicio: instanteIso(fila.event_start_time),
        fin: instanteIso(fila.event_end_time),
        conversacionId: enteroPositivo(fila.conversation_id),
        bandejaId: enteroPositivo(fila.inbox_id),
        agenteId: enteroPositivo(fila.user_id),
      });
    }

    const totalPaginas = numeroSeguro(r.meta?.total_pages);
    if (totalPaginas === null || pagina >= totalPaginas) break;
    if (pagina === MAX_PAGINAS_EVENTOS && totalPaginas > MAX_PAGINAS_EVENTOS) {
      truncado = true;
    }
  }

  return { eventos: acumulados, truncado };
}
