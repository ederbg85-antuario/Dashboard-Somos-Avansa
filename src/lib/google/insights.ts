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
  configuradoAnalitica: boolean;
  configuradoBusqueda: boolean;
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
    sesionesConInteraccion: number;
    tasaInteraccion: number | null;
    duracionMediaSegundos: number | null;
    vistasPorSesion: number | null;
    activosAhora: number | null;
    canalesDisponibles: boolean;
    canales: { nombre: string; sesiones: number; usuarios: number }[];
    diasDisponibles: boolean;
    dias: { fecha: string; sesiones: number; usuarios: number }[];
    paginasDisponibles: boolean;
    paginas: { ruta: string; titulo: string; vistas: number; usuarios: number }[];
    eventosDisponibles: boolean;
    eventosDetalle: { nombre: string; total: number; claves: number }[];
    contactosPorCanal: { canal: string; total: number }[] | null;
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

/** Analytics entrega la dimensión `date` como AAAAMMDD; el resto del panel usa ISO civil. */
const fechaAnalitica = (valor: string | undefined) => {
  const fecha = valor ?? "";
  const compacta = /^(\d{4})(\d{2})(\d{2})$/.exec(fecha);
  return compacta ? `${compacta[1]}-${compacta[2]}-${compacta[3]}` : fecha;
};

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
  const oauthConfigurado = googleOAuthConfigurado();
  const configuradoAnalitica = Boolean(oauthConfigurado && propertyId);
  const configuradoBusqueda = Boolean(oauthConfigurado && siteUrl);
  const configurado = configuradoAnalitica && configuradoBusqueda;
  const base: ResumenGoogle = {
    configurado,
    configuradoAnalitica,
    configuradoBusqueda,
    conectado: false,
    error: null,
    errorAnalitica: null,
    errorBusqueda: null,
    analitica: null,
    busqueda: null,
  };
  if (!configuradoAnalitica && !configuradoBusqueda) return base;

  let token: string | null;
  try {
    token = await tokenGoogle();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "No se pudo conectar con Google.";
    return {
      ...base,
      error: mensaje,
      errorAnalitica: configuradoAnalitica ? mensaje : null,
      errorBusqueda: configuradoBusqueda ? mensaje : null,
    };
  }
  if (!token) return base;

  const hastaBusqueda = diaAnterior(hasta);
  const rangoBusqueda = { startDate: desde, endDate: hastaBusqueda < desde ? desde : hastaBusqueda };

  const [resultadosGa, resultadosSearch] = await Promise.all([
    configuradoAnalitica ? Promise.allSettled([
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        metrics: [
          "activeUsers",
          "sessions",
          "screenPageViews",
          "eventCount",
          "keyEvents",
          "engagedSessions",
          "engagementRate",
          "averageSessionDuration",
          "screenPageViewsPerSession",
        ].map((name) => ({ name })),
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
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 12,
      }),
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 100,
      }),
      pedirGoogle<RespuestaGa>(`${ANALYTICS_URL}/properties/${propertyId}:runReport`, token, {
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: [{ name: "customEvent:canal" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          filter: {
            fieldName: "eventName",
            stringFilter: { matchType: "EXACT", value: "contact" },
          },
        },
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 20,
      }),
    ]) : Promise.resolve(null),
    configuradoBusqueda ? Promise.allSettled([
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
    ]) : Promise.resolve(null),
  ]);

  let analitica: ResumenGoogle["analitica"] = null;
  let busqueda: ResumenGoogle["busqueda"] = null;
  let errorAnalitica: string | null = null;
  let errorBusqueda: string | null = null;

  if (resultadosGa) {
    const [totalGa, canalesGa, diasGa, tiempoRealGa, paginasGa, eventosGa, contactosGa] = resultadosGa;
    if (totalGa.status === "fulfilled") {
      const total = totalGa.value.rows?.[0]?.metricValues ?? [];
      const realtime = tiempoRealGa.status === "fulfilled"
        ? tiempoRealGa.value.rows?.[0]?.metricValues?.[0]?.value
        : undefined;
      const canales = canalesGa.status === "fulfilled" ? canalesGa.value.rows ?? [] : [];
      const dias = diasGa.status === "fulfilled" ? diasGa.value.rows ?? [] : [];
      const paginas = paginasGa.status === "fulfilled" ? paginasGa.value.rows ?? [] : [];
      const eventos = eventosGa.status === "fulfilled" ? eventosGa.value.rows ?? [] : [];
      analitica = {
        usuarios: numero(total[0]?.value),
        sesiones: numero(total[1]?.value),
        vistas: numero(total[2]?.value),
        eventos: numero(total[3]?.value),
        eventosClave: numero(total[4]?.value),
        sesionesConInteraccion: numero(total[5]?.value),
        tasaInteraccion: total[6]?.value === undefined ? null : numero(total[6]?.value) * 100,
        duracionMediaSegundos: total[7]?.value === undefined ? null : numero(total[7]?.value),
        vistasPorSesion: total[8]?.value === undefined ? null : numero(total[8]?.value),
        activosAhora: realtime === undefined ? null : numero(realtime),
        canalesDisponibles: canalesGa.status === "fulfilled",
        canales: canales.map((fila) => ({
          nombre: fila.dimensionValues?.[0]?.value ?? "Sin clasificar",
          sesiones: numero(fila.metricValues?.[0]?.value),
          usuarios: numero(fila.metricValues?.[1]?.value),
        })),
        diasDisponibles: diasGa.status === "fulfilled",
        dias: dias.map((fila) => ({
          fecha: fechaAnalitica(fila.dimensionValues?.[0]?.value),
          sesiones: numero(fila.metricValues?.[0]?.value),
          usuarios: numero(fila.metricValues?.[1]?.value),
        })),
        paginasDisponibles: paginasGa.status === "fulfilled",
        paginas: paginas.map((fila) => ({
          ruta: fila.dimensionValues?.[0]?.value ?? "/",
          titulo: fila.dimensionValues?.[1]?.value ?? "Página sin título",
          vistas: numero(fila.metricValues?.[0]?.value),
          usuarios: numero(fila.metricValues?.[1]?.value),
        })),
        eventosDisponibles: eventosGa.status === "fulfilled",
        eventosDetalle: eventos.map((fila) => ({
          nombre: fila.dimensionValues?.[0]?.value ?? "",
          total: numero(fila.metricValues?.[0]?.value),
          claves: numero(fila.metricValues?.[1]?.value),
        })),
        contactosPorCanal: contactosGa.status === "fulfilled"
          ? (contactosGa.value.rows ?? []).map((fila) => ({
              canal: fila.dimensionValues?.[0]?.value ?? "Sin clasificar",
              total: numero(fila.metricValues?.[0]?.value),
            }))
          : null,
      };
    } else {
      errorAnalitica = totalGa.reason instanceof Error ? totalGa.reason.message : "La medición del sitio no respondió.";
    }
  }

  if (resultadosSearch) {
    const [totalSearch, consultasSearch, diasSearch] = resultadosSearch;
    if (totalSearch.status === "fulfilled") {
      const total = totalSearch.value.rows?.[0];
      const consultas = consultasSearch.status === "fulfilled" ? consultasSearch.value.rows ?? [] : [];
      const dias = diasSearch.status === "fulfilled" ? diasSearch.value.rows ?? [] : [];
      busqueda = {
        clics: total?.clicks ?? 0,
        impresiones: total?.impressions ?? 0,
        ctr: total?.ctr === undefined ? null : total.ctr * 100,
        posicion: total?.position ?? null,
        consultas: consultas.map((fila) => ({
          texto: fila.keys?.[0] ?? "—",
          clics: fila.clicks ?? 0,
          impresiones: fila.impressions ?? 0,
          posicion: fila.position ?? 0,
        })),
        dias: dias.map((fila) => ({
          fecha: fila.keys?.[0] ?? "",
          clics: fila.clicks ?? 0,
          impresiones: fila.impressions ?? 0,
          posicion: fila.position ?? 0,
        })),
      };
    } else {
      errorBusqueda = totalSearch.reason instanceof Error ? totalSearch.reason.message : "La medición de búsqueda no respondió.";
    }
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
