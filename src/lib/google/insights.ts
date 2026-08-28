import "server-only";
import { googleOAuthConfigurado, tokenGoogle } from "./cliente";

const ANALYTICS_URL = "https://analyticsdata.googleapis.com/v1beta";
const SEARCH_CONSOLE_URL = "https://searchconsole.googleapis.com/webmasters/v3";

type ValorApi = { value?: string };
type FilaApi = { dimensionValues?: ValorApi[]; metricValues?: ValorApi[] };
type RespuestaGa = { rows?: FilaApi[] };
type RespuestaSearch = { rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[] };

export type ResumenGoogle = {
  configurado: boolean;
  conectado: boolean;
  error: string | null;
  analitica: {
    usuarios: number;
    sesiones: number;
    vistas: number;
    eventos: number;
    eventosClave: number;
    activosAhora: number | null;
    canales: { nombre: string; sesiones: number; usuarios: number }[];
  } | null;
  busqueda: {
    clics: number;
    impresiones: number;
    ctr: number | null;
    posicion: number | null;
    consultas: { texto: string; clics: number; impresiones: number; posicion: number }[];
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
  const base: ResumenGoogle = { configurado, conectado: false, error: null, analitica: null, busqueda: null };
  if (!configurado) return base;

  let token: string | null;
  try {
    token = await tokenGoogle();
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : "No se pudo conectar con Google." };
  }
  if (!token) return base;

  try {
    const hastaBusqueda = diaAnterior(hasta);
    const [totalGa, canalesGa, tiempoRealGa, search] = await Promise.all([
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
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runRealtimeReport`, token, {
        metrics: [{ name: "activeUsers" }],
      }),
      pedirGoogle<RespuestaSearch>(
        `${SEARCH_CONSOLE_URL}/sites/${encodeURIComponent(siteUrl!)}/searchAnalytics/query`,
        token,
        {
          startDate: desde,
          endDate: hastaBusqueda < desde ? desde : hastaBusqueda,
          dimensions: ["query"],
          rowLimit: 8,
          dataState: "final",
        },
      ),
    ]);

    const total = totalGa.rows?.[0]?.metricValues ?? [];
    const realtime = tiempoRealGa.rows?.[0]?.metricValues?.[0]?.value;
    const consultas = search.rows ?? [];
    const clics = consultas.reduce((s, fila) => s + (fila.clicks ?? 0), 0);
    const impresiones = consultas.reduce((s, fila) => s + (fila.impressions ?? 0), 0);
    const posicionPonderada = impresiones > 0
      ? consultas.reduce((s, fila) => s + (fila.position ?? 0) * (fila.impressions ?? 0), 0) / impresiones
      : null;

    return {
      ...base,
      conectado: true,
      analitica: {
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
      },
      busqueda: {
        clics,
        impresiones,
        ctr: impresiones > 0 ? (clics * 100) / impresiones : null,
        posicion: posicionPonderada,
        consultas: consultas.map((fila) => ({
          texto: fila.keys?.[0] ?? "—",
          clics: fila.clicks ?? 0,
          impresiones: fila.impressions ?? 0,
          posicion: fila.position ?? 0,
        })),
      },
    };
  } catch (error) {
    return {
      ...base,
      conectado: true,
      error: error instanceof Error ? error.message : "Google no respondió.",
    };
  }
}
