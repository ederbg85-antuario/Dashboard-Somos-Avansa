import "server-only";

import * as chatwoot from "@/lib/chatwoot/cliente";
import * as reportesChatwoot from "@/lib/chatwoot/reportes";
import type {
  EventoReporteChatwoot,
  ResumenBandejaChatwoot,
} from "@/lib/chatwoot/reportes";
import { aFecha, esActividad } from "@/lib/chatwoot/tipos";
import { finDelDia, inicioDelDia, iso } from "@/lib/formato";
import type { Rango } from "@/lib/periodo";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { Sesion } from "@/lib/supabase/sesion";
import type { Conversacion, Lead, Perfil, Respuesta } from "@/lib/supabase/tipos";

type PerfilRendimiento = Pick<
  Perfil,
  "id" | "nombre" | "apellidos" | "activo" | "recibe_leads"
>;

type LeadRendimiento = Pick<
  Lead,
  "id" | "asesor_id" | "estado" | "valor_estimado" | "created_at" | "cerrado_en"
>;

type ConversacionRendimiento = Pick<
  Conversacion,
  "id" | "asignado_a" | "asignado_en" | "created_at" | "ultima_actividad_en"
>;

type RespuestaRendimiento = Pick<
  Respuesta,
  "mensaje_id" | "conversacion_id" | "autor_id" | "enviado_en"
>;

export type PuntoRendimiento = {
  fecha: string;
  leads: number;
  cierres: number;
};

export type FilaRendimiento = {
  asesor: PerfilRendimiento;
  leadsAsignados: number;
  cierresPeriodo: number;
  cierresCohorte: number;
  conversionCohorte: number | null;
  tiempoMedioCierreDias: number | null;
  montoCerrado: number;
  expedientesEnTramite: number;
  montoEnTramite: number;
  chatsRegistrados: number;
  cargaActiva: number | null;
  primeraRespuestaMinutos: number | null;
  respuestasMedidas: number;
  respuestaMediaMinutos: number | null;
  respuestasChatwootMedidas: number;
};

export type EstadoChatwoot = {
  estado: "sin-configurar" | "listo" | "parcial" | "error";
  detalle: string;
  conversacionesRevisadas: number;
  fuenteRespuestas: "reporting-events" | "mensajes-firmados" | null;
};

export type PuntoOperacionChatwoot = {
  timestamp: number;
  conversaciones: number;
  resoluciones: number;
};

export type IdentidadChatwoot = {
  id: number;
  nombre: string;
  email: string | null;
  conversaciones: number;
  resoluciones: number;
  primeraRespuestaSegundos: number | null;
  resolucionSegundos: number | null;
  respuestaSegundos: number | null;
};

export type ReporteOperativoChatwoot = {
  estado: "listo" | "parcial" | "error";
  detalle: string;
  resumen: ResumenBandejaChatwoot | null;
  tendencia: PuntoOperacionChatwoot[];
  identidades: IdentidadChatwoot[];
};

export type Rendimiento = {
  filas: FilaRendimiento[];
  tendencia: PuntoRendimiento[];
  sinAsignar: number;
  actualizadoEn: string;
  chatwoot: EstadoChatwoot;
  reporteChatwoot: ReporteOperativoChatwoot | null;
};

export type ResultadoRendimiento =
  | { listo: true; datos: Rendimiento }
  | { listo: false; fuente: "crm"; detalle: string };

const CAMPOS_LEAD = "id, asesor_id, estado, valor_estimado, created_at, cerrado_en";
const CAMPOS_CONVERSACION = "id, asignado_a, asignado_en, created_at, ultima_actividad_en";
const CAMPOS_RESPUESTA = "mensaje_id, conversacion_id, autor_id, enviado_en";
const MAX_CHATS_PRIMERA_RESPUESTA = 24;
const TAMANO_LOTE_CHATWOOT = 4;

const enRango = (valor: string | null, desde: number, hasta: number) => {
  if (!valor) return false;
  const instante = new Date(valor).getTime();
  return Number.isFinite(instante) && instante >= desde && instante <= hasta;
};

const promedio = (valores: number[]): number | null => {
  if (valores.length === 0) return null;
  return valores.reduce((suma, valor) => suma + valor, 0) / valores.length;
};

const monto = (leads: LeadRendimiento[]) =>
  leads.reduce((suma, lead) => suma + (Number(lead.valor_estimado) || 0), 0);

async function porLotes<T, R>(
  elementos: T[],
  tamano: number,
  trabajo: (elemento: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const resultados: PromiseSettledResult<R>[] = [];
  for (let inicio = 0; inicio < elementos.length; inicio += tamano) {
    resultados.push(...await Promise.allSettled(
      elementos.slice(inicio, inicio + tamano).map(trabajo),
    ));
  }
  return resultados;
}

type MetricasChatwoot = {
  activasPorAsesor: Map<string, number>;
  primeraRespuestaPorAsesor: Map<string, number[]>;
  respuestaMediaPorAsesor: Map<string, number[]>;
  estado: EstadoChatwoot;
};

async function metricasDeChatwoot(
  conversaciones: ConversacionRendimiento[],
  respuestas: RespuestaRendimiento[],
  desde: number,
  hasta: number,
): Promise<MetricasChatwoot> {
  const vacio = {
    activasPorAsesor: new Map<string, number>(),
    primeraRespuestaPorAsesor: new Map<string, number[]>(),
    respuestaMediaPorAsesor: new Map<string, number[]>(),
  };

  if (!chatwoot.hayChatwoot) {
    return {
      ...vacio,
      estado: {
        estado: "sin-configurar",
        detalle: "La carga activa y la primera respuesta aparecerán al conectar la bandeja oficial.",
        conversacionesRevisadas: 0,
        fuenteRespuestas: null,
      },
    };
  }

  try {
    const [activas, eventosResultado] = await Promise.all([
      chatwoot.conversaciones(),
      reportesChatwoot.eventosBandeja(
        new Date(desde).toISOString(),
        new Date(hasta).toISOString(),
      ).then((datos) => ({ listo: true as const, datos })).catch((error: unknown) => {
        console.error(
          "[avansa] Reporting events de Chatwoot no disponibles",
          error instanceof Error ? error.message : error,
        );
        return { listo: false as const };
      }),
    ]);
    const permitidas = new Map(conversaciones.map((conversacion) => [conversacion.id, conversacion]));
    const activasPorAsesor = new Map<string, number>();

    for (const activa of activas) {
      const local = permitidas.get(activa.id);
      if (!local?.asignado_a) continue;
      activasPorAsesor.set(local.asignado_a, (activasPorAsesor.get(local.asignado_a) ?? 0) + 1);
    }

    const firmasPorConversacion = new Map<number, Map<number, RespuestaRendimiento>>();
    for (const respuesta of respuestas) {
      const porMensaje = firmasPorConversacion.get(respuesta.conversacion_id) ?? new Map();
      porMensaje.set(respuesta.mensaje_id, respuesta);
      firmasPorConversacion.set(respuesta.conversacion_id, porMensaje);
    }

    const eventosPorConversacion = new Map<number, EventoReporteChatwoot[]>();
    if (eventosResultado.listo) {
      for (const evento of eventosResultado.datos.eventos) {
        if (!evento.conversacionId || !permitidas.has(evento.conversacionId)) continue;
        const actuales = eventosPorConversacion.get(evento.conversacionId) ?? [];
        actuales.push(evento);
        eventosPorConversacion.set(evento.conversacionId, actuales);
      }
    }

    // Sólo se consulta un conjunto acotado de chats recientes con respuestas
    // firmadas en el periodo. RLS ya limitó `conversaciones` y `respuestas`;
    // esta intersección impide que un evento global de Chatwoot termine en la
    // fila de otro asesor.
    const todasLasCandidatas = conversaciones
      .filter((conversacion) => {
        if (!conversacion.asignado_a) return false;
        const firmas = firmasPorConversacion.get(conversacion.id);
        return Boolean(firmas && [...firmas.values()].some((firma) =>
          firma.autor_id === conversacion.asignado_a && enRango(firma.enviado_en, desde, hasta)));
      })
      .sort((a, b) => (b.ultima_actividad_en ?? b.created_at).localeCompare(a.ultima_actividad_en ?? a.created_at));
    const candidatas = todasLasCandidatas
      .slice(0, MAX_CHATS_PRIMERA_RESPUESTA);

    const revisadas = await porLotes(candidatas, TAMANO_LOTE_CHATWOOT, async (conversacion) => {
      const mensajes = (await chatwoot.mensajes(conversacion.id))
        .filter((mensaje) => !mensaje.private && !esActividad(mensaje) && mensaje.created_at)
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

      const primerEntrante = mensajes.find((mensaje) => mensaje.message_type === 0);
      if (!primerEntrante?.created_at || !conversacion.asignado_a) return null;

      const firmas = firmasPorConversacion.get(conversacion.id);
      // Si la primera salida no está firmada por el propietario actual, no se
      // atribuye. Buscar una salida firmada posterior inflaría artificialmente
      // su tiempo de primera respuesta.
      const primeraSalida = mensajes.find((mensaje) =>
        mensaje.message_type === 1
        && Boolean(mensaje.created_at)
        && mensaje.created_at! >= primerEntrante.created_at!);
      const eventos = eventosPorConversacion.get(conversacion.id) ?? [];
      let primeraManual: number | null = null;
      let primeraOficial: number | null = null;
      if (primeraSalida?.created_at) {
        const firmaPrimera = firmas?.get(primeraSalida.id);
        if (firmaPrimera?.autor_id === conversacion.asignado_a) {
          const inicio = new Date(aFecha(primerEntrante.created_at)!).getTime();
          const respuesta = new Date(aFecha(primeraSalida.created_at)!).getTime();
          const minutos = (respuesta - inicio) / 60_000;
          if (
            Number.isFinite(minutos)
            && minutos >= 0
            && enRango(aFecha(primeraSalida.created_at), desde, hasta)
          ) {
            primeraManual = minutos;
          }

          const evento = eventos.find((candidato) =>
            candidato.nombre.toLowerCase() === "first_response"
            && coincideConMensaje(candidato, primeraSalida.created_at!));
          if (evento && evento.valorSegundos >= 0) {
            primeraOficial = evento.valorSegundos / 60;
          }
        }
      }

      const salidasFirmadas = mensajes.filter((mensaje) => {
        if (mensaje.message_type !== 1 || !mensaje.created_at) return false;
        const firma = firmas?.get(mensaje.id);
        return firma?.autor_id === conversacion.asignado_a
          && enRango(aFecha(mensaje.created_at), desde, hasta);
      });
      const respuestasOficiales = eventos.flatMap((evento) => {
        if (evento.nombre.toLowerCase() !== "reply_time" || evento.valorSegundos < 0) return [];
        return salidasFirmadas.some((mensaje) => coincideConMensaje(evento, mensaje.created_at!))
          ? [evento.valorSegundos / 60]
          : [];
      });

      return {
        asesorId: conversacion.asignado_a,
        primeraManual,
        primeraOficial,
        respuestasOficiales,
      };
    });

    const primeraRespuestaPorAsesor = new Map<string, number[]>();
    const respuestaMediaPorAsesor = new Map<string, number[]>();
    let fallidas = 0;
    for (const resultado of revisadas) {
      if (resultado.status === "rejected") {
        fallidas += 1;
        continue;
      }
      if (!resultado.value) continue;
      const primera = eventosResultado.listo
        ? resultado.value.primeraOficial
        : resultado.value.primeraManual;
      if (primera !== null) {
        const actuales = primeraRespuestaPorAsesor.get(resultado.value.asesorId) ?? [];
        actuales.push(primera);
        primeraRespuestaPorAsesor.set(resultado.value.asesorId, actuales);
      }
      if (eventosResultado.listo && resultado.value.respuestasOficiales.length > 0) {
        const actuales = respuestaMediaPorAsesor.get(resultado.value.asesorId) ?? [];
        actuales.push(...resultado.value.respuestasOficiales);
        respuestaMediaPorAsesor.set(resultado.value.asesorId, actuales);
      }
    }

    const recortadas = todasLasCandidatas.length > candidatas.length;
    const eventosRecortados = eventosResultado.listo && eventosResultado.datos.truncado;
    const parcial = fallidas > 0 || recortadas || !eventosResultado.listo || eventosRecortados;
    const fuenteRespuestas = eventosResultado.listo
      ? "reporting-events" as const
      : "mensajes-firmados" as const;

    let detalle = "Carga abierta y tiempos oficiales de respuesta verificados con la bandeja.";
    if (!eventosResultado.listo) {
      detalle = "Carga activa verificada; la primera respuesta usa los mensajes confirmados por Avansa.";
    } else if (eventosRecortados) {
      detalle = "La actividad excedió 500 registros; las métricas de respuesta cubren el bloque más reciente disponible.";
    } else if (recortadas) {
      detalle = `Primera respuesta calculada sobre los ${MAX_CHATS_PRIMERA_RESPUESTA} chats firmados más recientes del periodo.`;
    } else if (fallidas > 0) {
      detalle = "Algunos chats no pudieron consultarse; los promedios usan sólo respuestas verificadas.";
    }

    return {
      activasPorAsesor,
      primeraRespuestaPorAsesor,
      respuestaMediaPorAsesor,
      estado: {
        estado: parcial ? "parcial" : "listo",
        detalle,
        conversacionesRevisadas: revisadas.filter((resultado) => resultado.status === "fulfilled").length,
        fuenteRespuestas,
      },
    };
  } catch (error) {
    console.error("[avansa] Rendimiento Chatwoot no disponible", error instanceof Error ? error.message : error);
    return {
      ...vacio,
      estado: {
        estado: "error",
        detalle: "La bandeja oficial no respondió; las métricas comerciales siguen disponibles.",
        conversacionesRevisadas: 0,
        fuenteRespuestas: null,
      },
    };
  }
}

function coincideConMensaje(evento: EventoReporteChatwoot, creadoEnSegundos: number): boolean {
  if (!evento.fin) return false;
  const fin = new Date(evento.fin).getTime();
  const mensaje = creadoEnSegundos * 1000;
  return Number.isFinite(fin) && Math.abs(fin - mensaje) <= 15_000;
}

/**
 * Informe operativo oficial para administradores. No se devuelve a asesores:
 * el resumen es de toda la bandeja y el agrupado por agente abarca incluso
 * otras bandejas de la cuenta de Chatwoot.
 */
async function cargarReporteOperativoChatwoot(
  desde: string,
  hasta: string,
): Promise<ReporteOperativoChatwoot | null> {
  if (!chatwoot.hayChatwoot) return null;

  const [resumen, conversaciones, resoluciones, agentes, identidades] = await Promise.allSettled([
    reportesChatwoot.resumenBandeja(desde, hasta),
    reportesChatwoot.serieBandeja("conversations_count", desde, hasta),
    reportesChatwoot.serieBandeja("resolutions_count", desde, hasta),
    reportesChatwoot.resumenPorAgente(desde, hasta),
    reportesChatwoot.agentesCuenta(),
  ]);
  const resultados = [resumen, conversaciones, resoluciones, agentes, identidades];
  const exitos = resultados.filter((resultado) => resultado.status === "fulfilled").length;

  for (const resultado of resultados) {
    if (resultado.status === "rejected") {
      console.error(
        "[avansa] Reporte operativo Chatwoot incompleto",
        resultado.reason instanceof Error ? resultado.reason.message : resultado.reason,
      );
    }
  }

  const serie = new Map<number, { conversaciones: number; resoluciones: number }>();
  if (conversaciones.status === "fulfilled") {
    for (const punto of conversaciones.value) {
      const actual = serie.get(punto.timestamp) ?? { conversaciones: 0, resoluciones: 0 };
      actual.conversaciones = punto.valor;
      serie.set(punto.timestamp, actual);
    }
  }
  if (resoluciones.status === "fulfilled") {
    for (const punto of resoluciones.value) {
      const actual = serie.get(punto.timestamp) ?? { conversaciones: 0, resoluciones: 0 };
      actual.resoluciones = punto.valor;
      serie.set(punto.timestamp, actual);
    }
  }

  const nombres = new Map(
    identidades.status === "fulfilled"
      ? identidades.value.map((agente) => [agente.id, agente] as const)
      : [],
  );
  const filas = agentes.status === "fulfilled"
    ? agentes.value.map((agente): IdentidadChatwoot => ({
        ...agente,
        nombre: nombres.get(agente.id)?.nombre ?? `Agente ${agente.id}`,
        email: nombres.get(agente.id)?.email ?? null,
      }))
    : [];

  return {
    estado: exitos === resultados.length ? "listo" : exitos === 0 ? "error" : "parcial",
    detalle: exitos === resultados.length
      ? "Resumen y tendencia limitados a la bandeja oficial; identidades agrupadas al alcance completo de la cuenta."
      : "La bandeja entregó sólo una parte del informe operativo; cada bloque conserva su alcance.",
    resumen: resumen.status === "fulfilled" ? resumen.value : null,
    tendencia: [...serie.entries()]
      .sort(([a], [b]) => a - b)
      .map(([timestamp, valores]) => ({ timestamp, ...valores })),
    identidades: filas,
  };
}

/**
 * Carga el rendimiento con la sesión real. No usa `service_role`: perfiles,
 * leads, chats y firmas pasan por las políticas RLS, así que un asesor nunca
 * recibe datos de otra persona, ni siquiera antes de agregarlos.
 */
export async function cargarRendimiento(
  sesion: Sesion,
  rango: Rango,
): Promise<ResultadoRendimiento> {
  const supabase = await clienteServidor();
  const desdeIso = inicioDelDia(rango.desde);
  const hastaIso = finDelDia(rango.hasta);
  const desde = new Date(desdeIso).getTime();
  const hasta = new Date(hastaIso).getTime();

  const perfilesPromesa = sesion.perfil.rol === "admin"
    ? supabase
        .from("perfiles")
        .select("id, nombre, apellidos, activo, recibe_leads")
        .eq("rol", "asesor")
        .order("nombre")
    : Promise.resolve({
        data: [{
          id: sesion.perfil.id,
          nombre: sesion.perfil.nombre,
          apellidos: sesion.perfil.apellidos,
          activo: sesion.perfil.activo,
          recibe_leads: sesion.perfil.recibe_leads,
        }],
        error: null,
      });

  const [perfilesResultado, leadsResultado, conversacionesResultado, respuestasResultado] =
    await Promise.all([
      perfilesPromesa,
      supabase.from("leads").select(CAMPOS_LEAD).eq("es_demo", false),
      supabase
        .from("conversaciones")
        .select(CAMPOS_CONVERSACION)
        .eq("bandeja_id", chatwoot.bandejaId ?? -1),
      supabase.from("respuestas").select(CAMPOS_RESPUESTA),
    ]);

  if (perfilesResultado.error || leadsResultado.error) {
    console.error("[avansa] Rendimiento CRM no disponible", {
      perfiles: perfilesResultado.error?.code,
      leads: leadsResultado.error?.code,
    });
    return {
      listo: false,
      fuente: "crm",
      detalle: "No fue posible consultar el CRM en este momento.",
    };
  }

  const perfiles = (perfilesResultado.data ?? []) as PerfilRendimiento[];
  const leads = ((leadsResultado.data ?? []) as unknown as LeadRendimiento[]);
  const conversaciones = conversacionesResultado.error
    ? []
    : ((conversacionesResultado.data ?? []) as ConversacionRendimiento[]);
  const respuestas = respuestasResultado.error
    ? []
    : ((respuestasResultado.data ?? []) as RespuestaRendimiento[]);

  if (conversacionesResultado.error || respuestasResultado.error) {
    console.error("[avansa] Fuente local de mensajería incompleta", {
      conversaciones: conversacionesResultado.error?.code,
      respuestas: respuestasResultado.error?.code,
    });
  }

  const chatPromesa: Promise<MetricasChatwoot> = conversacionesResultado.error || respuestasResultado.error
    ? Promise.resolve({
        activasPorAsesor: new Map<string, number>(),
        primeraRespuestaPorAsesor: new Map<string, number[]>(),
        respuestaMediaPorAsesor: new Map<string, number[]>(),
        estado: {
          estado: "error" as const,
          detalle: "No fue posible consultar el registro local de mensajería.",
          conversacionesRevisadas: 0,
          fuenteRespuestas: null,
        },
      })
    : metricasDeChatwoot(conversaciones, respuestas, desde, hasta);
  const reportePromesa = sesion.perfil.rol === "admin"
    ? cargarReporteOperativoChatwoot(desdeIso, hastaIso)
    : Promise.resolve(null);
  const [chat, reporteChatwoot] = await Promise.all([chatPromesa, reportePromesa]);

  const filas = perfiles.map((asesor): FilaRendimiento => {
    const propios = leads.filter((lead) => lead.asesor_id === asesor.id);
    const cohorte = propios.filter((lead) => enRango(lead.created_at, desde, hasta));
    const cierresPeriodo = propios.filter((lead) =>
      lead.estado === "cerrado" && enRango(lead.cerrado_en, desde, hasta));
    const cierresCohorte = cohorte.filter((lead) => lead.estado === "cerrado");
    const abiertos = propios.filter((lead) => !["cerrado", "descartado"].includes(lead.estado));
    const tiemposCierre = cierresPeriodo.flatMap((lead) => {
      if (!lead.cerrado_en) return [];
      const dias = (new Date(lead.cerrado_en).getTime() - new Date(lead.created_at).getTime()) / 86_400_000;
      return Number.isFinite(dias) && dias >= 0 ? [dias] : [];
    });
    const respuestasAsesor = chat.primeraRespuestaPorAsesor.get(asesor.id) ?? [];
    const respuestasChatwoot = chat.respuestaMediaPorAsesor.get(asesor.id) ?? [];

    return {
      asesor,
      leadsAsignados: cohorte.length,
      cierresPeriodo: cierresPeriodo.length,
      cierresCohorte: cierresCohorte.length,
      conversionCohorte: cohorte.length > 0 ? (cierresCohorte.length * 100) / cohorte.length : null,
      tiempoMedioCierreDias: promedio(tiemposCierre),
      montoCerrado: monto(cierresPeriodo),
      expedientesEnTramite: abiertos.length,
      montoEnTramite: monto(abiertos),
      chatsRegistrados: conversaciones.filter((conversacion) => conversacion.asignado_a === asesor.id).length,
      cargaActiva: chat.estado.estado === "listo" || chat.estado.estado === "parcial"
        ? chat.activasPorAsesor.get(asesor.id) ?? 0
        : null,
      primeraRespuestaMinutos: promedio(respuestasAsesor),
      respuestasMedidas: respuestasAsesor.length,
      respuestaMediaMinutos: promedio(respuestasChatwoot),
      respuestasChatwootMedidas: respuestasChatwoot.length,
    };
  });

  const porDia = new Map<string, { leads: number; cierres: number }>();
  for (const lead of leads) {
    if (enRango(lead.created_at, desde, hasta)) {
      const dia = iso(new Date(lead.created_at));
      const valor = porDia.get(dia) ?? { leads: 0, cierres: 0 };
      valor.leads += 1;
      porDia.set(dia, valor);
    }
    if (lead.estado === "cerrado" && enRango(lead.cerrado_en, desde, hasta)) {
      const dia = iso(new Date(lead.cerrado_en!));
      const valor = porDia.get(dia) ?? { leads: 0, cierres: 0 };
      valor.cierres += 1;
      porDia.set(dia, valor);
    }
  }

  const tendencia: PuntoRendimiento[] = [];
  for (let cursor = new Date(desdeIso); cursor.getTime() <= hasta; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const fecha = iso(cursor);
    const valor = porDia.get(fecha) ?? { leads: 0, cierres: 0 };
    tendencia.push({ fecha, ...valor });
  }

  return {
    listo: true,
    datos: {
      filas,
      tendencia,
      sinAsignar: sesion.perfil.rol === "admin"
        ? leads.filter((lead) => !lead.asesor_id && enRango(lead.created_at, desde, hasta)).length
        : 0,
      actualizadoEn: new Date().toISOString(),
      chatwoot: chat.estado,
      reporteChatwoot,
    },
  };
}
