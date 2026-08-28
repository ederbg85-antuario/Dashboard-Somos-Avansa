import "server-only";

import { randomUUID } from "node:crypto";
import {
  ErrorPublicacionMeta,
  estadoConfiguracionPublicacion,
  leerResultadoMeta,
  publicarFacebook,
  publicarInstagram,
  validarPiezaPublicable,
  type MedioPublicable,
  type PasoMeta,
  type PiezaPublicable,
  type PlataformaMeta,
  type ResultadoPublicacionMeta,
} from "@/lib/meta/publicador";
import { clienteServicio } from "@/lib/supabase/servicio";
import type { ContenidoMedio, ContenidoSocial } from "@/lib/supabase/tipos";

type ClienteServicio = NonNullable<ReturnType<typeof clienteServicio>>;

export type ResumenColaPublicacion = {
  configurada: boolean;
  reclamadas: number;
  publicadas: number;
  esperando: number;
  conError: number;
  recuperadas: number;
};

const LIMITE_POR_EJECUCION = 1;
const LEASE_MINUTOS = 4;
const MAX_INTENTOS = 50;

const isoEnMinutos = (minutos: number) => new Date(Date.now() + minutos * 60_000).toISOString();
const detalleSeguro = (valor: unknown) => String(valor ?? "")
  .replace(/https?:\/\/\S+/gi, "[URL]")
  .replace(/(?:access[_-]?token|token)=[^\s&]+/gi, "token=[OCULTO]")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 500);

function resultadoJson(resultado: ResultadoPublicacionMeta) {
  return resultado as unknown as Record<string, unknown>;
}

function tieneOperacionIncierta(resultado: ResultadoPublicacionMeta) {
  return (["facebook", "instagram"] as const).some((plataforma) => {
    const paso = resultado[plataforma];
    return paso && ["preparando", "subiendo", "enviando", "incierto"].includes(paso.estado);
  });
}

function marcarOperacionesInciertas(resultado: ResultadoPublicacionMeta) {
  const siguiente = { ...resultado };
  for (const plataforma of ["facebook", "instagram"] as const) {
    const actual = siguiente[plataforma];
    if (!actual || !["preparando", "subiendo", "enviando"].includes(actual.estado)) continue;
    siguiente[plataforma] = {
      ...actual,
      estado: "incierto",
      actualizado_en: new Date().toISOString(),
      detalle: "La ejecucion se interrumpio durante una mutacion; revision manual necesaria para evitar duplicados.",
    };
  }
  return siguiente;
}

async function recuperarBloqueosVencidos(supabase: ClienteServicio) {
  const ahora = new Date().toISOString();
  const { data: bloqueadas, error } = await supabase
    .from("contenidos_sociales")
    .select("id, resultado_meta, lease_token, publicacion_intentos")
    .eq("estado", "publicando")
    .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahora}`)
    .limit(12);

  if (error) throw new Error(`No se pudo revisar la cola detenida: ${error.message}`);
  let recuperadas = 0;

  for (const fila of bloqueadas ?? []) {
    const resultado = leerResultadoMeta(fila.resultado_meta);
    const incierta = tieneOperacionIncierta(resultado);
    const agotada = fila.publicacion_intentos >= MAX_INTENTOS;
    const cambios = incierta
      ? {
          estado: "error" as const,
          resultado_meta: resultadoJson(marcarOperacionesInciertas(resultado)),
          error_publicacion: "Ejecucion interrumpida durante un envio. Verifica Meta antes de reintentar.",
          bloqueado_hasta: null,
          lease_token: null,
          siguiente_intento_en: null,
        }
      : agotada
        ? {
            estado: "error" as const,
            error_publicacion: "La ejecución llegó al máximo de revisiones. Confirma el estado en Meta antes de reintentar.",
            bloqueado_hasta: null,
            lease_token: null,
            siguiente_intento_en: null,
          }
      : {
          estado: "programado" as const,
          bloqueado_hasta: null,
          lease_token: null,
          siguiente_intento_en: ahora,
        };

    let liberar = supabase
      .from("contenidos_sociales")
      .update(cambios)
      .eq("id", fila.id)
      .eq("estado", "publicando")
      .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahora}`);
    liberar = fila.lease_token
      ? liberar.eq("lease_token", fila.lease_token)
      : liberar.is("lease_token", null);
    const { data: liberada, error: actualizarError } = await liberar
      .select("id")
      .maybeSingle();
    if (actualizarError) {
      throw new Error(`No se pudo liberar una pieza detenida: ${actualizarError.message}`);
    }
    if (liberada) recuperadas += 1;
  }

  return recuperadas;
}

async function mediosConUrl(supabase: ClienteServicio, contenidoId: string) {
  const { data, error } = await supabase
    .from("contenido_medios")
    .select("*")
    .eq("contenido_id", contenidoId)
    .order("orden");
  if (error) throw new ErrorPublicacionMeta(`No se pudieron leer los archivos: ${error.message}`, true);

  return Promise.all(((data ?? []) as ContenidoMedio[]).map(async (medio): Promise<MedioPublicable> => {
    // Seis horas cubren el procesamiento de Meta sin volver publico el bucket.
    const { data: firma, error: firmaError } = await supabase.storage
      .from("avansa-contenido")
      .createSignedUrl(medio.storage_path, 6 * 60 * 60);
    if (firmaError || !firma?.signedUrl) {
      throw new ErrorPublicacionMeta(`No se pudo firmar ${medio.storage_path}.`, true);
    }
    return { ...medio, url: firma.signedUrl };
  }));
}

function pasoTrasError(anterior: PasoMeta | undefined, error: ErrorPublicacionMeta): PasoMeta {
  const estado = error.incierto
    ? "incierto"
    : error.reintentable
      ? (anterior?.contenedor_id || anterior?.video_id ? "procesando" : "pendiente")
      : "error";
  return {
    ...anterior,
    estado,
    actualizado_en: new Date().toISOString(),
    detalle: detalleSeguro(error.message),
  };
}

async function procesarPieza(supabase: ClienteServicio, contenido: ContenidoSocial) {
  if (!contenido.lease_token) {
    throw new ErrorPublicacionMeta("La pieza no tiene un bloqueo de publicacion valido.", false, true);
  }
  const leaseToken = contenido.lease_token;
  const medios = await mediosConUrl(supabase, contenido.id);
  const pieza: PiezaPublicable = {
    id: contenido.id,
    titulo: contenido.titulo,
    texto: contenido.texto,
    tipo: contenido.tipo,
    plataformas: contenido.plataformas,
    medios,
  };
  const validacion = validarPiezaPublicable(pieza);
  if (!validacion.ok) throw new ErrorPublicacionMeta(validacion.error);

  let resultado = leerResultadoMeta(contenido.resultado_meta);
  let esperando = false;

  const plataformas = contenido.plataformas as PlataformaMeta[];
  for (const [indice, plataforma] of plataformas.entries()) {
    const guardar = async (nuevo: PasoMeta) => {
      resultado = { ...resultado, [plataforma]: nuevo };
      const { data, error } = await supabase
        .from("contenidos_sociales")
        .update({
          resultado_meta: resultadoJson(resultado),
          bloqueado_hasta: isoEnMinutos(LEASE_MINUTOS),
        })
        .eq("id", contenido.id)
        .eq("estado", "publicando")
        .eq("lease_token", leaseToken)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        throw new ErrorPublicacionMeta(
          error?.message || "La pieza perdio su bloqueo de publicacion.",
          false,
          true,
        );
      }
    };

    try {
      const yaPublicada = resultado[plataforma]?.estado === "publicado";
      const estado = plataforma === "facebook"
        ? await publicarFacebook(pieza, resultado.facebook, guardar)
        : await publicarInstagram(pieza, resultado.instagram, guardar);
      if (!yaPublicada) {
        const quedanPlataformas = plataformas
          .slice(indice + 1)
          .some((siguiente) => resultado[siguiente]?.estado !== "publicado");
        esperando = estado === "espera" || quedanPlataformas;
        // Una ejecución realiza como máximo un paso de una plataforma. Así el
        // presupuesto de 55 s nunca acumula varias mutaciones Graph de 25 s.
        break;
      }
    } catch (causa) {
      const error = causa instanceof ErrorPublicacionMeta
        ? causa
        : new ErrorPublicacionMeta(causa instanceof Error ? causa.message : "Fallo inesperado al publicar.");
      const nuevo = pasoTrasError(resultado[plataforma], error);
      try {
        await guardar(nuevo);
      } catch {
        // El marcador previo sigue en la base. Al vencer el lease, la
        // recuperacion lo aislara como incierto antes de cualquier reenvio.
      }
      throw error;
    }
  }

  if (esperando) {
    const agotada = contenido.publicacion_intentos >= MAX_INTENTOS;
    const { data, error } = await supabase
      .from("contenidos_sociales")
      .update({
        estado: agotada ? "error" : "programado",
        resultado_meta: resultadoJson(resultado),
        siguiente_intento_en: agotada ? null : isoEnMinutos(1),
        bloqueado_hasta: null,
        lease_token: null,
        error_publicacion: agotada
          ? "Meta no termino de procesar la pieza tras 50 revisiones. Confirma su estado antes de reintentar."
          : null,
      })
      .eq("id", contenido.id)
      .eq("estado", "publicando")
      .eq("lease_token", leaseToken)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new ErrorPublicacionMeta(
        error?.message || "La pieza perdio su bloqueo antes de volver a la cola.",
        false,
        true,
      );
    }
    return agotada ? "error" as const : "espera" as const;
  }

  const publicadoEn = new Date().toISOString();
  const { data, error } = await supabase
    .from("contenidos_sociales")
    .update({
      estado: "publicado",
      publicado_en: publicadoEn,
      resultado_meta: resultadoJson(resultado),
      error_publicacion: null,
      siguiente_intento_en: null,
      bloqueado_hasta: null,
      lease_token: null,
    })
    .eq("id", contenido.id)
    .eq("estado", "publicando")
    .eq("lease_token", leaseToken)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    throw new ErrorPublicacionMeta(
      error?.message || "Meta respondio, pero la pieza perdio su bloqueo al cerrar la cola.",
      false,
      true,
    );
  }
  return "publicado" as const;
}

async function registrarError(
  supabase: ClienteServicio,
  contenido: ContenidoSocial,
  causa: unknown,
) {
  if (!contenido.lease_token) {
    throw new Error("No se puede registrar un fallo sin el token del trabajador.");
  }
  const error = causa instanceof ErrorPublicacionMeta
    ? causa
    : new ErrorPublicacionMeta(causa instanceof Error ? causa.message : "Fallo inesperado al publicar.");
  const intentos = contenido.publicacion_intentos;
  const seReintenta = error.reintentable && !error.incierto && intentos < MAX_INTENTOS;
  const demora = Math.min(30, Math.max(2, 2 ** Math.min(4, intentos - 1)));
  const { data, error: guardarError } = await supabase
    .from("contenidos_sociales")
    .update({
      estado: seReintenta ? "programado" : "error",
      error_publicacion: detalleSeguro(error.message),
      siguiente_intento_en: seReintenta ? isoEnMinutos(demora) : null,
      bloqueado_hasta: null,
      lease_token: null,
    })
    .eq("id", contenido.id)
    .eq("estado", "publicando")
    .eq("lease_token", contenido.lease_token)
    .select("id")
    .maybeSingle();
  if (guardarError || !data) {
    throw new Error(
      guardarError?.message || "El trabajador perdio su bloqueo antes de registrar el fallo.",
    );
  }
  return seReintenta;
}

/**
 * Procesa piezas vencidas ya aprobadas. Una RPC repite todos los predicados y
 * entrega un lease UUID en el mismo UPDATE; cada escritura posterior exige ese
 * token para que un trabajador vencido no pueda pisar al siguiente.
 */
export async function procesarColaPublicacion(
  limite = LIMITE_POR_EJECUCION,
): Promise<ResumenColaPublicacion> {
  const resumen: ResumenColaPublicacion = {
    configurada: false,
    reclamadas: 0,
    publicadas: 0,
    esperando: 0,
    conError: 0,
    recuperadas: 0,
  };
  const supabase = clienteServicio();
  if (!supabase) return resumen;

  resumen.recuperadas = await recuperarBloqueosVencidos(supabase);
  if (!estadoConfiguracionPublicacion([]).lista) return resumen;
  resumen.configurada = true;

  const ahora = new Date().toISOString();
  const { data: candidatas, error } = await supabase
    .from("contenidos_sociales")
    .select("*")
    .eq("estado", "programado")
    .not("autorizado_en", "is", null)
    .lte("programado_para", ahora)
    .or(`siguiente_intento_en.is.null,siguiente_intento_en.lte.${ahora}`)
    .lt("publicacion_intentos", MAX_INTENTOS)
    .order("programado_para", { ascending: true })
    .limit(Math.max(1, Math.min(limite, 8)));
  if (error) throw new Error(`No se pudo consultar la cola social: ${error.message}`);

  const listas = (candidatas ?? []) as ContenidoSocial[];

  for (const candidata of listas) {
    const leaseToken = randomUUID();
    const { data: reclamada, error: reclamarError } = await supabase
      .rpc("reclamar_contenido_social", {
        p_id: candidata.id,
        p_ahora: ahora,
        p_bloqueado_hasta: isoEnMinutos(LEASE_MINUTOS),
        p_lease_token: leaseToken,
      })
      .maybeSingle();
    if (reclamarError) throw new Error(`No se pudo reclamar una pieza: ${reclamarError.message}`);
    if (!reclamada) continue;

    resumen.reclamadas += 1;
    try {
      const resultado = await procesarPieza(supabase, reclamada as ContenidoSocial);
      if (resultado === "publicado") resumen.publicadas += 1;
      else if (resultado === "espera") resumen.esperando += 1;
      else resumen.conError += 1;
    } catch (causa) {
      const reintenta = await registrarError(supabase, reclamada as ContenidoSocial, causa);
      if (reintenta) resumen.esperando += 1;
      else resumen.conError += 1;
    }
  }

  return resumen;
}
