import "server-only";

import * as chatwoot from "@/lib/chatwoot/cliente";
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
};

export type EstadoChatwoot = {
  estado: "sin-configurar" | "listo" | "parcial" | "error";
  detalle: string;
  conversacionesRevisadas: number;
};

export type Rendimiento = {
  filas: FilaRendimiento[];
  tendencia: PuntoRendimiento[];
  sinAsignar: number;
  actualizadoEn: string;
  chatwoot: EstadoChatwoot;
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
  };

  if (!chatwoot.hayChatwoot) {
    return {
      ...vacio,
      estado: {
        estado: "sin-configurar",
        detalle: "La carga activa y la primera respuesta aparecerán al conectar Chatwoot.",
        conversacionesRevisadas: 0,
      },
    };
  }

  try {
    const activas = await chatwoot.conversaciones();
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

    // Sólo se consulta un conjunto acotado de chats recientes que tengan una
    // respuesta firmada. Una respuesta enviada directamente desde Chatwoot no
    // se atribuye a un asesor: sería una suposición, no una métrica.
    const candidatas = conversaciones
      .filter((conversacion) => {
        const fechaAsignacion = conversacion.asignado_en ?? conversacion.created_at;
        return Boolean(
          conversacion.asignado_a
          && enRango(fechaAsignacion, desde, hasta)
          && firmasPorConversacion.has(conversacion.id),
        );
      })
      .sort((a, b) => (b.asignado_en ?? b.created_at).localeCompare(a.asignado_en ?? a.created_at))
      .slice(0, MAX_CHATS_PRIMERA_RESPUESTA);

    const revisadas = await porLotes(candidatas, TAMANO_LOTE_CHATWOOT, async (conversacion) => {
      const mensajes = (await chatwoot.mensajes(conversacion.id))
        .filter((mensaje) => !mensaje.private && !esActividad(mensaje) && mensaje.created_at)
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

      const primerEntrante = mensajes.find((mensaje) => mensaje.message_type === 0);
      if (!primerEntrante?.created_at || !conversacion.asignado_a) return null;

      const firmas = firmasPorConversacion.get(conversacion.id);
      const primeraFirmada = mensajes.find((mensaje) => {
        if (mensaje.message_type !== 1 || !mensaje.created_at) return false;
        const firma = firmas?.get(mensaje.id);
        return firma?.autor_id === conversacion.asignado_a
          && mensaje.created_at >= primerEntrante.created_at!;
      });

      if (!primeraFirmada?.created_at) return null;
      const inicio = new Date(aFecha(primerEntrante.created_at)!).getTime();
      const respuesta = new Date(aFecha(primeraFirmada.created_at)!).getTime();
      const minutos = (respuesta - inicio) / 60_000;
      if (!Number.isFinite(minutos) || minutos < 0) return null;
      return { asesorId: conversacion.asignado_a, minutos };
    });

    const primeraRespuestaPorAsesor = new Map<string, number[]>();
    let fallidas = 0;
    for (const resultado of revisadas) {
      if (resultado.status === "rejected") {
        fallidas += 1;
        continue;
      }
      if (!resultado.value) continue;
      const actuales = primeraRespuestaPorAsesor.get(resultado.value.asesorId) ?? [];
      actuales.push(resultado.value.minutos);
      primeraRespuestaPorAsesor.set(resultado.value.asesorId, actuales);
    }

    const recortadas = conversaciones.filter((conversacion) => {
      const fechaAsignacion = conversacion.asignado_en ?? conversacion.created_at;
      return enRango(fechaAsignacion, desde, hasta) && firmasPorConversacion.has(conversacion.id);
    }).length > candidatas.length;

    return {
      activasPorAsesor,
      primeraRespuestaPorAsesor,
      estado: {
        estado: fallidas > 0 || recortadas ? "parcial" : "listo",
        detalle: recortadas
          ? `Primera respuesta calculada sobre los ${MAX_CHATS_PRIMERA_RESPUESTA} chats firmados más recientes del periodo.`
          : fallidas > 0
            ? "Algunos chats no pudieron consultarse; el promedio usa sólo respuestas verificadas."
            : "Carga abierta y respuestas verificadas directamente con Chatwoot.",
        conversacionesRevisadas: revisadas.filter((resultado) => resultado.status === "fulfilled").length,
      },
    };
  } catch (error) {
    console.error("[avansa] Rendimiento Chatwoot no disponible", error instanceof Error ? error.message : error);
    return {
      ...vacio,
      estado: {
        estado: "error",
        detalle: "Chatwoot no respondió; las métricas del CRM siguen disponibles.",
        conversacionesRevisadas: 0,
      },
    };
  }
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
      supabase.from("conversaciones").select(CAMPOS_CONVERSACION),
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

  const chat = conversacionesResultado.error || respuestasResultado.error
    ? {
        activasPorAsesor: new Map<string, number>(),
        primeraRespuestaPorAsesor: new Map<string, number[]>(),
        estado: {
          estado: "error" as const,
          detalle: "No fue posible consultar el registro local de mensajería.",
          conversacionesRevisadas: 0,
        },
      }
    : await metricasDeChatwoot(conversaciones, respuestas, desde, hasta);

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
    },
  };
}
