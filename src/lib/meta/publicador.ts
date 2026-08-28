import "server-only";

import type {
  ContenidoMedio,
  ContenidoSocial,
} from "@/lib/supabase/tipos";

/**
 * Publicador organico de Meta.
 *
 * El token vive exclusivamente en el servidor y es distinto al usado para
 * Ads. Cada mutacion externa se precede por un marcador persistido en
 * `resultado_meta`; si el proceso cae despues de enviar la peticion, la cola
 * se detiene para revision en vez de repetirla y duplicar contenido.
 */

export type PlataformaMeta = "facebook" | "instagram";

export type EstadoPasoMeta =
  | "pendiente"
  | "preparando"
  | "subiendo"
  | "procesando"
  | "enviando"
  | "publicado"
  | "error"
  | "incierto";

export type PasoMeta = {
  estado: EstadoPasoMeta;
  operacion?: string;
  iniciado_en?: string;
  actualizado_en: string;
  contenedor_id?: string;
  video_id?: string;
  archivo_subido?: boolean;
  id_externo?: string;
  detalle?: string;
  confirmacion?: "respuesta_meta" | "estado_meta";
};

export type ResultadoPublicacionMeta = {
  esquema: 1;
  facebook?: PasoMeta;
  instagram?: PasoMeta;
};

export type MedioPublicable = ContenidoMedio & { url?: string };

export type PiezaPublicable = Pick<
  ContenidoSocial,
  "id" | "titulo" | "texto" | "tipo" | "plataformas"
> & { medios: MedioPublicable[] };

export type ResultadoValidacion =
  | { ok: true }
  | { ok: false; error: string };

export type ResultadoPlataforma = "publicado" | "espera";

type GuardarPaso = (paso: PasoMeta) => Promise<void>;

type ConfiguracionMeta = {
  token: string;
  version: string;
  paginaId: string | null;
  instagramId: string | null;
};

type ErrorGraph = {
  message?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
};

type CuerpoGraph = {
  error?: ErrorGraph;
  [campo: string]: unknown;
};

type PermisoGraph = {
  permission?: string;
  status?: string;
};

const VIDEO = new Set(["video/mp4", "video/quicktime"]);
const IMAGEN_FACEBOOK = new Set(["image/jpeg", "image/png"]);
const IMAGEN_INSTAGRAM = new Set(["image/jpeg"]);
const ESTADOS_PASO = new Set<EstadoPasoMeta>([
  "pendiente",
  "preparando",
  "subiendo",
  "procesando",
  "enviando",
  "publicado",
  "error",
  "incierto",
]);

const ahora = () => new Date().toISOString();
const detalleSeguro = (valor: unknown) => String(valor ?? "")
  .replace(/https?:\/\/\S+/gi, "[URL]")
  .replace(/(?:access[_-]?token|token)=[^\s&]+/gi, "token=[OCULTO]")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 500);

export class ErrorPublicacionMeta extends Error {
  constructor(
    message: string,
    readonly reintentable = false,
    readonly incierto = false,
  ) {
    super(message);
    this.name = "ErrorPublicacionMeta";
  }
}

function idSeguro(valor: string | undefined, nombre: string) {
  if (!valor || !/^\d+$/.test(valor)) {
    throw new ErrorPublicacionMeta(`${nombre} no tiene un identificador valido.`);
  }
  return valor;
}

function versionSegura(valor: string | undefined) {
  return valor && /^v\d+\.\d+$/.test(valor) ? valor : "v26.0";
}

export function estadoConfiguracionPublicacion(plataformas: PlataformaMeta[] = ["facebook", "instagram"]) {
  const faltantes: string[] = [];
  if (!process.env.META_CONTENT_ACCESS_TOKEN) faltantes.push("META_CONTENT_ACCESS_TOKEN");
  if (plataformas.includes("facebook") && !process.env.META_PAGE_ID) faltantes.push("META_PAGE_ID");
  if (plataformas.includes("instagram") && !process.env.META_INSTAGRAM_ACCOUNT_ID) {
    faltantes.push("META_INSTAGRAM_ACCOUNT_ID");
  }
  return { lista: faltantes.length === 0, faltantes };
}

/** Confirma token y activos con lecturas; no crea contenido ni prueba escritura. */
export async function verificarActivosPublicacion(plataformas: PlataformaMeta[]): Promise<ResultadoValidacion> {
  try {
    const config = configuracion(plataformas);
    const base = `https://graph.facebook.com/${config.version}`;
    // Meta no permite consultar `/me/permissions` con un token de Página,
    // aunque ese sea el token correcto (y estable) para publicar. Conservamos
    // el token de Página para las mutaciones y usamos el token de usuario de
    // larga duración únicamente para validar permisos y activos.
    const tokenValidacion = process.env.META_CONTENT_VALIDATION_TOKEN?.trim() || config.token;
    const permisos = await pedirGraph<{ data?: PermisoGraph[] } & CuerpoGraph>(
      `${base}/me/permissions`,
      tokenValidacion,
    );
    const concedidos = new Set(
      (permisos.data ?? [])
        .filter((permiso) => permiso.status === "granted" && permiso.permission)
        .map((permiso) => permiso.permission!),
    );
    const requeridos = new Set<string>();
    if (plataformas.includes("facebook")) {
      requeridos.add("pages_read_engagement");
      requeridos.add("pages_manage_posts");
    }
    if (plataformas.includes("instagram")) {
      requeridos.add("instagram_basic");
      requeridos.add("instagram_content_publish");
    }
    const faltantes = [...requeridos].filter((permiso) => !concedidos.has(permiso));
    if (faltantes.length) {
      throw new ErrorPublicacionMeta(
        `El token técnico aún no tiene: ${faltantes.join(", ")}.`,
      );
    }

    const consultas: Promise<CuerpoGraph>[] = [];
    if (config.paginaId) {
      consultas.push(pedirGraph<CuerpoGraph>(`${base}/${config.paginaId}?fields=id,name`, tokenValidacion));
    }
    if (config.instagramId) {
      consultas.push(pedirGraph<CuerpoGraph>(`${base}/${config.instagramId}?fields=id,username`, tokenValidacion));
    }
    await Promise.all(consultas);
    return { ok: true };
  } catch (causa) {
    return {
      ok: false,
      error: causa instanceof Error ? causa.message : "Meta no pudo validar los activos.",
    };
  }
}

function configuracion(plataformas: PlataformaMeta[]): ConfiguracionMeta {
  const estado = estadoConfiguracionPublicacion(plataformas);
  if (!estado.lista) {
    throw new ErrorPublicacionMeta(`Falta configurar ${estado.faltantes.join(", ")}.`);
  }

  return {
    token: process.env.META_CONTENT_ACCESS_TOKEN!,
    version: versionSegura(process.env.META_API_VERSION),
    paginaId: plataformas.includes("facebook")
      ? idSeguro(process.env.META_PAGE_ID, "La pagina de Facebook")
      : null,
    instagramId: plataformas.includes("instagram")
      ? idSeguro(process.env.META_INSTAGRAM_ACCOUNT_ID, "La cuenta de Instagram")
      : null,
  };
}

/** Convierte el JSON abierto de Postgres al subconjunto que controla la cola. */
export function leerResultadoMeta(valor: unknown): ResultadoPublicacionMeta {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return { esquema: 1 };
  const original = valor as Record<string, unknown>;
  const resultado: ResultadoPublicacionMeta = { esquema: 1 };

  for (const plataforma of ["facebook", "instagram"] as const) {
    const candidato = original[plataforma];
    if (!candidato || typeof candidato !== "object" || Array.isArray(candidato)) continue;
    const paso = candidato as Record<string, unknown>;
    const estado = String(paso.estado ?? "");
    if (!ESTADOS_PASO.has(estado as EstadoPasoMeta)) continue;
    resultado[plataforma] = {
      estado: estado as EstadoPasoMeta,
      actualizado_en: String(paso.actualizado_en ?? ahora()),
      ...(paso.operacion ? { operacion: detalleSeguro(paso.operacion) } : {}),
      ...(paso.iniciado_en ? { iniciado_en: String(paso.iniciado_en) } : {}),
      ...(paso.contenedor_id ? { contenedor_id: detalleSeguro(paso.contenedor_id) } : {}),
      ...(paso.video_id ? { video_id: detalleSeguro(paso.video_id) } : {}),
      ...(typeof paso.archivo_subido === "boolean" ? { archivo_subido: paso.archivo_subido } : {}),
      ...(paso.id_externo ? { id_externo: detalleSeguro(paso.id_externo) } : {}),
      ...(paso.detalle ? { detalle: detalleSeguro(paso.detalle) } : {}),
      ...(paso.confirmacion === "respuesta_meta" || paso.confirmacion === "estado_meta"
        ? { confirmacion: paso.confirmacion }
        : {}),
    };
  }

  return resultado;
}

function unMedio(pieza: PiezaPublicable) {
  return pieza.medios.length === 1 ? pieza.medios[0] : null;
}

/**
 * Valida solamente las combinaciones que este publicador implementa con
 * endpoints oficiales. No intenta adivinar codecs, dimensiones o duracion;
 * Meta conserva la validacion final del archivo.
 */
export function validarPiezaPublicable(pieza: PiezaPublicable): ResultadoValidacion {
  const medio = unMedio(pieza);

  if (pieza.medios.length > 1) {
    return { ok: false, error: "Esta version publica una sola pieza visual por salida; los carruseles siguen como borrador." };
  }

  if (pieza.plataformas.includes("facebook")) {
    if (pieza.tipo === "historia") {
      return { ok: false, error: "Las historias se pueden enviar a Instagram; Facebook no ofrece un endpoint estable en este flujo." };
    }
    if (pieza.tipo === "reel" && (!medio || !VIDEO.has(medio.mime_type))) {
      return { ok: false, error: "Un reel de Facebook necesita un solo video MP4 o MOV." };
    }
    if (pieza.tipo === "publicacion") {
      if (!medio && !pieza.texto.trim()) {
        return { ok: false, error: "La publicacion de Facebook necesita copy o una imagen." };
      }
      if (medio && (medio.tipo_archivo !== "imagen" || !IMAGEN_FACEBOOK.has(medio.mime_type))) {
        return { ok: false, error: "La publicacion de Facebook admite una imagen JPG o PNG en este flujo." };
      }
    }
  }

  if (pieza.plataformas.includes("instagram")) {
    if (!medio) return { ok: false, error: "Instagram necesita un archivo visual." };
    if (pieza.tipo === "publicacion" && (medio.tipo_archivo !== "imagen" || !IMAGEN_INSTAGRAM.has(medio.mime_type))) {
      return { ok: false, error: "El feed de Instagram requiere una imagen JPG en este flujo." };
    }
    if (pieza.tipo === "reel" && !VIDEO.has(medio.mime_type)) {
      return { ok: false, error: "Un reel de Instagram necesita un video MP4 o MOV." };
    }
    if (pieza.tipo === "historia"
      && !IMAGEN_INSTAGRAM.has(medio.mime_type)
      && !VIDEO.has(medio.mime_type)) {
      return { ok: false, error: "La historia de Instagram necesita una imagen JPG o un video MP4/MOV." };
    }
  }

  return { ok: true };
}

function urlMedio(pieza: PiezaPublicable) {
  const medio = unMedio(pieza);
  if (!medio?.url || !medio.url.startsWith("https://")) {
    throw new ErrorPublicacionMeta("No se pudo generar el enlace temporal HTTPS del archivo.", true);
  }
  return medio.url;
}

function errorDesdeGraph(respuesta: Response, cuerpo: CuerpoGraph, mutacion: boolean) {
  const error = cuerpo.error;
  const mensaje = detalleSeguro(error?.message) || `Meta respondio ${respuesta.status}.`;
  const codigo = Number(error?.code) || 0;
  const limitado = respuesta.status === 429 || [4, 17, 32, 341, 613].includes(codigo);
  const servidor = respuesta.status >= 500 || error?.is_transient === true || [1, 2].includes(codigo);

  // Un error de limite confirma que la operacion no fue aceptada y se puede
  // intentar despues. Un 5xx durante una mutacion es ambiguo: repetirlo podria
  // duplicar una publicacion que Meta si alcanzo a procesar.
  return new ErrorPublicacionMeta(
    mensaje,
    limitado || (!mutacion && servidor),
    mutacion && servidor,
  );
}

async function pedirGraph<T extends CuerpoGraph>(
  url: string,
  token: string,
  opciones: { metodo?: "GET" | "POST"; cuerpo?: URLSearchParams; cabeceras?: HeadersInit; mutacion?: boolean } = {},
): Promise<T> {
  const metodo = opciones.metodo ?? "GET";
  const mutacion = opciones.mutacion ?? metodo === "POST";
  let respuesta: Response;

  try {
    respuesta = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opciones.cuerpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...opciones.cabeceras,
      },
      body: opciones.cuerpo,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new ErrorPublicacionMeta(
      mutacion
        ? "No se pudo confirmar si Meta recibio la operacion; requiere revision manual."
        : "No se pudo consultar el estado en Meta; se intentara de nuevo.",
      !mutacion,
      mutacion,
    );
  }

  let cuerpo: CuerpoGraph = {};
  try {
    cuerpo = await respuesta.json() as CuerpoGraph;
  } catch {
    if (!respuesta.ok) throw new ErrorPublicacionMeta(`Meta respondio ${respuesta.status} sin detalle.`);
  }

  if (!respuesta.ok || cuerpo.error) throw errorDesdeGraph(respuesta, cuerpo, mutacion);
  return cuerpo as T;
}

function paso(
  estado: EstadoPasoMeta,
  anterior: PasoMeta | undefined,
  extra: Partial<PasoMeta> = {},
): PasoMeta {
  return {
    ...anterior,
    ...extra,
    estado,
    actualizado_en: ahora(),
  };
}

function asegurarNoAmbiguo(anterior: PasoMeta | undefined, operaciones: string[]) {
  if (anterior?.estado === "incierto") {
    throw new ErrorPublicacionMeta(anterior.detalle || "La publicacion requiere revision manual.", false, true);
  }
  if (anterior && ["preparando", "subiendo", "enviando"].includes(anterior.estado)
    && anterior.operacion && operaciones.includes(anterior.operacion)) {
    throw new ErrorPublicacionMeta(
      "La ejecucion anterior termino durante una operacion externa; no se repetira para evitar duplicados.",
      false,
      true,
    );
  }
}

export async function publicarFacebook(
  pieza: PiezaPublicable,
  anterior: PasoMeta | undefined,
  guardar: GuardarPaso,
): Promise<ResultadoPlataforma> {
  if (anterior?.estado === "publicado") return "publicado";
  const config = configuracion(["facebook"]);
  const paginaId = config.paginaId!;
  const base = `https://graph.facebook.com/${config.version}`;

  if (pieza.tipo === "historia") {
    throw new ErrorPublicacionMeta("Las historias de Facebook no estan habilitadas por este publicador.");
  }

  if (pieza.tipo === "publicacion") {
    asegurarNoAmbiguo(anterior, ["publicar_feed", "publicar_foto"]);
    const medio = unMedio(pieza);
    const operacion = medio ? "publicar_foto" : "publicar_feed";
    const marcador = paso("enviando", anterior, { operacion, iniciado_en: ahora(), detalle: undefined });
    await guardar(marcador);

    const cuerpo = new URLSearchParams();
    if (medio) {
      cuerpo.set("url", urlMedio(pieza));
      if (pieza.texto.trim()) cuerpo.set("caption", pieza.texto.trim());
    } else {
      cuerpo.set("message", pieza.texto.trim());
    }

    const respuesta = await pedirGraph<{ id?: string; post_id?: string } & CuerpoGraph>(
      `${base}/${paginaId}/${medio ? "photos" : "feed"}`,
      config.token,
      { metodo: "POST", cuerpo, mutacion: true },
    );
    const id = detalleSeguro(respuesta.post_id ?? respuesta.id);
    if (!id) throw new ErrorPublicacionMeta("Meta acepto la publicacion, pero no devolvio su identificador.", false, true);

    await guardar(paso("publicado", marcador, {
      id_externo: id,
      confirmacion: "respuesta_meta",
      detalle: undefined,
    }));
    return "publicado";
  }

  let actual = anterior;
  asegurarNoAmbiguo(actual, ["crear_reel", "subir_reel", "finalizar_reel"]);
  const videoUrl = urlMedio(pieza);

  if (!actual?.video_id) {
    const marcador = paso("preparando", actual, { operacion: "crear_reel", iniciado_en: ahora(), detalle: undefined });
    await guardar(marcador);
    const respuesta = await pedirGraph<{ video_id?: string } & CuerpoGraph>(
      `${base}/${paginaId}/video_reels`,
      config.token,
      { metodo: "POST", cuerpo: new URLSearchParams({ upload_phase: "start" }), mutacion: true },
    );
    const videoId = detalleSeguro(respuesta.video_id);
    if (!videoId) throw new ErrorPublicacionMeta("Meta no devolvio el identificador del reel.", false, true);
    actual = paso("pendiente", marcador, {
      video_id: videoId,
      archivo_subido: false,
      operacion: undefined,
      iniciado_en: undefined,
    });
    await guardar(actual);
    return "espera";
  }

  if (!actual.archivo_subido) {
    const marcador = paso("subiendo", actual, { operacion: "subir_reel", iniciado_en: ahora(), detalle: undefined });
    await guardar(marcador);
    const uploadUrl = `https://rupload.facebook.com/video-upload/${config.version}/${actual.video_id}`;
    await pedirGraph<CuerpoGraph>(uploadUrl, config.token, {
      metodo: "POST",
      cabeceras: {
        Authorization: `OAuth ${config.token}`,
        file_url: videoUrl,
      },
      mutacion: true,
    });
    actual = paso("pendiente", marcador, {
      archivo_subido: true,
      operacion: undefined,
      iniciado_en: undefined,
    });
    await guardar(actual);
    return "espera";
  }

  if (actual.operacion !== "reel_finalizado") {
    const marcador = paso("enviando", actual, { operacion: "finalizar_reel", iniciado_en: ahora(), detalle: undefined });
    await guardar(marcador);
    const cuerpo = new URLSearchParams({
      video_id: actual.video_id!,
      upload_phase: "finish",
      video_state: "PUBLISHED",
      description: pieza.texto.trim(),
      title: pieza.titulo,
    });
    await pedirGraph<CuerpoGraph>(`${base}/${paginaId}/video_reels`, config.token, {
      metodo: "POST",
      cuerpo,
      mutacion: true,
    });
    actual = paso("procesando", marcador, {
      operacion: "reel_finalizado",
      iniciado_en: undefined,
    });
    await guardar(actual);
    return "espera";
  }

  const consulta = await pedirGraph<{
    status?: {
      video_status?: string;
      uploading_phase?: { status?: string };
      processing_phase?: { status?: string };
      publishing_phase?: { status?: string };
    };
  } & CuerpoGraph>(`${base}/${actual.video_id}?fields=status`, config.token);
  const estadoVideo = String(consulta.status?.video_status ?? "").toLowerCase();
  const estadoPublicacion = String(consulta.status?.publishing_phase?.status ?? "").toLowerCase();
  const reportaFasePublicacion = Boolean(consulta.status?.publishing_phase?.status);

  if (["error", "failed", "expired"].includes(estadoVideo)
    || ["error", "failed"].includes(estadoPublicacion)) {
    throw new ErrorPublicacionMeta("Meta no pudo procesar el reel de Facebook.");
  }
  if (["complete", "completed", "published"].includes(estadoPublicacion)
    || estadoVideo === "published"
    || (!reportaFasePublicacion && ["ready", "complete", "completed"].includes(estadoVideo))) {
    await guardar(paso("publicado", actual, {
      id_externo: actual.video_id,
      confirmacion: "estado_meta",
      detalle: undefined,
    }));
    return "publicado";
  }

  await guardar(paso("procesando", actual, { detalle: "Meta sigue procesando el reel." }));
  return "espera";
}

export async function publicarInstagram(
  pieza: PiezaPublicable,
  anterior: PasoMeta | undefined,
  guardar: GuardarPaso,
): Promise<ResultadoPlataforma> {
  if (anterior?.estado === "publicado") return "publicado";
  const config = configuracion(["instagram"]);
  const instagramId = config.instagramId!;
  const base = `https://graph.facebook.com/${config.version}`;
  let actual = anterior;

  asegurarNoAmbiguo(actual, ["crear_contenedor"]);
  const medio = unMedio(pieza)!;

  if (!actual?.contenedor_id) {
    const marcador = paso("preparando", actual, {
      operacion: "crear_contenedor",
      iniciado_en: ahora(),
      detalle: undefined,
    });
    await guardar(marcador);

    const cuerpo = new URLSearchParams();
    if (pieza.tipo === "publicacion") {
      cuerpo.set("image_url", urlMedio(pieza));
      if (pieza.texto.trim()) cuerpo.set("caption", pieza.texto.trim());
    } else {
      cuerpo.set("media_type", pieza.tipo === "reel" ? "REELS" : "STORIES");
      cuerpo.set(medio.tipo_archivo === "video" ? "video_url" : "image_url", urlMedio(pieza));
      if (pieza.tipo === "reel") {
        if (pieza.texto.trim()) cuerpo.set("caption", pieza.texto.trim());
        cuerpo.set("share_to_feed", "true");
      }
    }

    const respuesta = await pedirGraph<{ id?: string } & CuerpoGraph>(
      `${base}/${instagramId}/media`,
      config.token,
      { metodo: "POST", cuerpo, mutacion: true },
    );
    const contenedorId = detalleSeguro(respuesta.id);
    if (!contenedorId) throw new ErrorPublicacionMeta("Instagram no devolvio el contenedor de medios.", false, true);
    actual = paso("procesando", marcador, {
      contenedor_id: contenedorId,
      operacion: undefined,
      iniciado_en: undefined,
    });
    await guardar(actual);
    return "espera";
  }

  if (actual.operacion !== "contenedor_listo") {
    const consulta = await pedirGraph<{ status_code?: string; status?: string } & CuerpoGraph>(
      `${base}/${actual.contenedor_id}?fields=status_code,status`,
      config.token,
    );
    const estado = String(consulta.status_code ?? "").toUpperCase();

    if (estado === "PUBLISHED") {
      await guardar(paso("publicado", actual, {
        id_externo: actual.id_externo ?? actual.contenedor_id,
        confirmacion: "estado_meta",
        detalle: undefined,
      }));
      return "publicado";
    }
    if (["ERROR", "EXPIRED"].includes(estado)) {
      throw new ErrorPublicacionMeta(detalleSeguro(consulta.status) || "Instagram no pudo procesar el archivo.");
    }
    if (actual.estado === "enviando" && actual.operacion === "publicar_contenedor") {
      throw new ErrorPublicacionMeta(
        "Instagram no confirma si el contenedor ya se publico; requiere revision manual.",
        false,
        true,
      );
    }
    if (estado !== "FINISHED") {
      await guardar(paso("procesando", actual, {
        detalle: detalleSeguro(consulta.status) || "Instagram sigue procesando el archivo.",
      }));
      return "espera";
    }

    actual = paso("pendiente", actual, {
      operacion: "contenedor_listo",
      detalle: undefined,
    });
    await guardar(actual);
    return "espera";
  }

  const marcador = paso("enviando", actual, {
    operacion: "publicar_contenedor",
    iniciado_en: ahora(),
    detalle: undefined,
  });
  await guardar(marcador);
  const respuesta = await pedirGraph<{ id?: string } & CuerpoGraph>(
    `${base}/${instagramId}/media_publish`,
    config.token,
    {
      metodo: "POST",
      cuerpo: new URLSearchParams({ creation_id: actual.contenedor_id! }),
      mutacion: true,
    },
  );
  const id = detalleSeguro(respuesta.id);
  if (!id) throw new ErrorPublicacionMeta("Instagram acepto la publicacion, pero no devolvio su identificador.", false, true);
  await guardar(paso("publicado", marcador, {
    id_externo: id,
    confirmacion: "respuesta_meta",
    detalle: undefined,
  }));
  return "publicado";
}
