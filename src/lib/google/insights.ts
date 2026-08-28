import "server-only";
import { googleOAuthConfigurado, tokenGoogle } from "./cliente";

const ANALYTICS_URL = "https://analyticsdata.googleapis.com/v1beta";
const SEARCH_CONSOLE_URL = "https://searchconsole.googleapis.com/webmasters/v3";

type ValorApi = { value?: string };
type FilaApi = { dimensionValues?: ValorApi[]; metricValues?: ValorApi[] };
type RespuestaGa = { rows?: FilaApi[] };
type FilaSearch = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type RespuestaSearch = { rows?: FilaSearch[] };

export type ResumenGoogle = {
  configurado: boolean;
  conectado: boolean;
  error: string | null;
  errorAnalitica: string | null;
  errorBusqueda: string | null;
  analitica: {
    usuarios: number;
    sesiones: number;
    vistas: number;
    eventos: number;
    eventosClave: number;
    activosAhora: number | null;
    canales: { nombre: string; sesiones: number; usuarios: number }[];
    dias: { fecha: string; sesiones: number; usuarios: number }[];
  } | null;
  busqueda: {
    clics: number;
    impresiones: number;
    ctr: number | null;
    posicion: number | null;
    consultas: { texto: string; clics: number; impresiones: number; posicion: number }[];
    dias: { fecha: string; clics: number; impresiones: number; posicion: number }[];
  } | null;
};

const numero = (valor: string | undefined) => Number(valor) || 0;

async function pedirGoogle<T>(url: string, token: string, cuerpo: unknown): Promise<T> {
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const datos = await respuesta.json() as T & { error?: { message?: string } };
  if (!respuesta.ok) throw new Error(datos.error?.message ?? `Google respondió ${respuesta.status}.`);
  return datos;
}

const diaAnterior = (fecha: string) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Consulta únicamente la propiedad GA4 y el sitio de Search Console fijados
 * en Vercel. Aunque el usuario OAuth tenga otros activos, este dashboard no
 * acepta identificadores desde el navegador.
 */
export async function resumenGoogle(desde: string, hasta: string): Promise<ResumenGoogle> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL;
  const configurado = Boolean(googleOAuthConfigurado() && propertyId && siteUrl);
  const base: ResumenGoogle = {
    configurado,
    conectado: false,
    error: null,
    errorAnalitica: null,
    errorBusqueda: null,
    analitica: null,
    busqueda: null,
  };
  if (!configurado) return base;

  let token: string | null;
  try {
    token = await tokenGoogle();
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : "No se pudo conectar con Google." };
  }
  if (!token) return base;

  const hastaBusqueda = diaAnterior(hasta);
  const rangoBusqueda = { startDate: desde, endDate: hastaBusqueda < desde ? desde : hastaBusqueda };

  const [resultadoGa, resultadoSearch] = await Promise.allSettled([
    Promise.all([
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        metrics: ["activeUsers", "sessions", "screenPageViews", "eventCount", "keyEvents"].map((name) => ({ name })),
      }),
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      }),
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 366,
      }),
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runRealtimeReport`, token, {
        metrics: [{ name: "activeUsers" }],
      }),
    ]),
    Promise.all([
      pedirGoogle<RespuestaSearch>(
        `${SEARCH_CONSOLE_URL}/sites/${encodeURIComponent(siteUrl!)}/searchAnalytics/query`,
        token,
        {
          ...rangoBusqueda,
          rowLimit: 1,
          dataState: "final",
        },
      ),
      pedirGoogle<RespuestaSearch>(
        `${SEARCH_CONSOLE_URL}/sites/${encodeURIComponent(siteUrl!)}/searchAnalytics/query`,
        token,
        {
          ...rangoBusqueda,
          dimensions: ["query"],
          rowLimit: 12,
          dataState: "final",
        },
      ),
      pedirGoogle<RespuestaSearch>(
        `${SEARCH_CONSOLE_URL}/sites/${encodeURIComponent(siteUrl!)}/searchAnalytics/query`,
        token,
        {
          ...rangoBusqueda,
          dimensions: ["date"],
          rowLimit: 500,
          dataState: "final",
        },
      ),
    ]),
  ]);

  let analitica: ResumenGoogle["analitica"] = null;
  let busqueda: ResumenGoogle["busqueda"] = null;
  let errorAnalitica: string | null = null;
  let errorBusqueda: string | null = null;

  if (resultadoGa.status === "fulfilled") {
    const [totalGa, canalesGa, diasGa, tiempoRealGa] = resultadoGa.value;
    const total = totalGa.rows?.[0]?.metricValues ?? [];
    const realtime = tiempoRealGa.rows?.[0]?.metricValues?.[0]?.value;
    analitica = {
        usuarios: numero(total[0]?.value),
        sesiones: numero(total[1]?.value),
        vistas: numero(total[2]?.value),
        eventos: numero(total[3]?.value),
        eventosClave: numero(total[4]?.value),
        activosAhora: realtime === undefined ? null : numero(realtime),
        canales: (canalesGa.rows ?? []).map((fila) => ({
          nombre: fila.dimensionValues?.[0]?.value ?? "Sin clasificar",
          sesiones: numero(fila.metricValues?.[0]?.value),
          usuarios: numero(fila.metricValues?.[1]?.value),
        })),
        dias: (diasGa.rows ?? []).map((fila) => ({
          fecha: fila.dimensionValues?.[0]?.value ?? "",
          sesiones: numero(fila.metricValues?.[0]?.value),
          usuarios: numero(fila.metricValues?.[1]?.value),
        })),
    };
  } else {
    errorAnalitica = resultadoGa.reason instanceof Error ? resultadoGa.reason.message : "Google Analytics no respondió.";
  }

  if (resultadoSearch.status === "fulfilled") {
    const [totalSearch, consultasSearch, diasSearch] = resultadoSearch.value;
    const total = totalSearch.rows?.[0];
    busqueda = {
        clics: total?.clicks ?? 0,
        impresiones: total?.impressions ?? 0,
        ctr: total?.ctr === undefined ? null : total.ctr * 100,
        posicion: total?.position ?? null,
        consultas: (consultasSearch.rows ?? []).map((fila) => ({
          texto: fila.keys?.[0] ?? "—",
          clics: fila.clicks ?? 0,
          impresiones: fila.impressions ?? 0,
          posicion: fila.position ?? 0,
        })),
        dias: (diasSearch.rows ?? []).map((fila) => ({
          fecha: fila.keys?.[0] ?? "",
          clics: fila.clicks ?? 0,
          impresiones: fila.impressions ?? 0,
          posicion: fila.position ?? 0,
        })),
    };
  } else {
    errorBusqueda = resultadoSearch.reason instanceof Error ? resultadoSearch.reason.message : "Search Console no respondió.";
  }

  return {
    ...base,
    conectado: true,
    errorAnalitica,
    errorBusqueda,
    error: [errorAnalitica, errorBusqueda].filter(Boolean).join(" · ") || null,
    analitica,
    busqueda,
  };
}
