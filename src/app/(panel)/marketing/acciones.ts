"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { metaConfigurado, traerInsights } from "@/lib/meta/insights";
import {
  estadoConfiguracionPublicacion,
  leerResultadoMeta,
  validarPiezaPublicable,
  verificarActivosPublicacion,
} from "@/lib/meta/publicador";
import { haceDias, iso } from "@/lib/formato";
import type { CampanaEstado, EstadoContenidoSocial, TipoContenidoSocial } from "@/lib/supabase/tipos";
import { fechaLocalMexicoAIso } from "./_lib/fecha-mexico";

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const texto = (fd: FormData, campo: string, max = 200) => {
  const v = String(fd.get(campo) ?? "").trim().slice(0, max);
  return v.length ? v : null;
};
const entero = (fd: FormData, campo: string) => Math.max(0, Math.round(Number(fd.get(campo)) || 0));
const decimal = (fd: FormData, campo: string) => Math.max(0, Number(fd.get(campo)) || 0);

function refrescar() {
  revalidatePath("/marketing");
  revalidatePath("/marketing/meta");
  revalidatePath("/marketing/sitio-web");
  revalidatePath("/marketing/search-console");
  revalidatePath("/marketing/instagram");
  revalidatePath("/marketing/contenido");
  revalidatePath("/funnel");
  revalidatePath("/");
}

// ---------- campañas ------------------------------------------------------

export async function guardarCampana(datos: FormData): Promise<Resultado> {
  await exigirRol("admin");
  const supabase = await clienteServidor();

  const nombre = texto(datos, "nombre", 160);
  if (!nombre) return { ok: false, error: "La campaña necesita nombre." };

  const estadoSolicitado = texto(datos, "estado") ?? "borrador";
  const estadosSeguros = new Set<CampanaEstado>(["borrador", "pausada"]);
  if (!estadosSeguros.has(estadoSolicitado as CampanaEstado)) {
    return { ok: false, error: "Sólo puedes guardar campañas en borrador o pausadas." };
  }

  const fechaInicio = texto(datos, "fecha_inicio", 10);
  const fechaFin = texto(datos, "fecha_fin", 10);
  if (Boolean(fechaInicio) !== Boolean(fechaFin)) {
    return { ok: false, error: "Define inicio y término juntos, o deja ambas fechas pendientes." };
  }
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    return { ok: false, error: "La fecha de término no puede ser anterior al inicio." };
  }

  const fila = {
    nombre,
    objetivo: texto(datos, "objetivo", 80),
    estado: estadoSolicitado as CampanaEstado,
    publico: texto(datos, "publico", 200),
    meta_campaign_id: texto(datos, "meta_campaign_id", 60),
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    presupuesto_diario: decimal(datos, "presupuesto_diario") || null,
    notas: texto(datos, "notas", 1000),
  };

  const id = texto(datos, "id");
  const { error } = id
    ? await supabase.from("campanas").update(fila).eq("id", id)
    : await supabase.from("campanas").insert(fila);

  if (error) {
    console.error("[avansa] No se pudo guardar la campaña:", error.code);
    return {
      ok: false,
      error: error.code === "23505"
        ? "Ya existe una campaña con ese identificador de Meta."
        : "No se pudo guardar la campaña. Intenta de nuevo.",
    };
  }

  refrescar();
  const estadoVisible = estadoSolicitado === "pausada" ? "pausada" : "borrador";
  return { ok: true, aviso: id ? "Registro de campaña actualizado." : `Campaña «${nombre}» guardada como ${estadoVisible} en Avansa.` };
}

// ---------- métrica diaria ------------------------------------------------

/**
 * Captura o corrige el desempeño de un día.
 *
 * Es `upsert` sobre (campaña, fecha): reescribir el mismo día corrige el dato
 * en vez de duplicarlo, que es justo lo que hace falta cuando Meta ajusta
 * cifras con 24 horas de retraso.
 */
export async function guardarMetrica(datos: FormData): Promise<Resultado> {
  await exigirRol("admin");
  const supabase = await clienteServidor();

  const campana_id = texto(datos, "campana_id", 40);
  const fecha = texto(datos, "fecha", 10);
  if (!campana_id || !fecha) return { ok: false, error: "Elige la campaña y el día." };

  const { error } = await supabase.from("metricas_campana").upsert(
    {
      campana_id,
      fecha,
      impresiones: entero(datos, "impresiones"),
      alcance: entero(datos, "alcance"),
      clics: entero(datos, "clics"),
      gasto: decimal(datos, "gasto"),
      leads: entero(datos, "leads"),
      conversaciones: entero(datos, "conversaciones"),
    },
    { onConflict: "campana_id,fecha" },
  );

  if (error) {
    console.error("[avansa] No se pudo guardar la métrica:", error.code);
    return { ok: false, error: "No se pudo guardar la medición. Intenta de nuevo." };
  }
  refrescar();
  return { ok: true, aviso: `Métrica del ${fecha} guardada.` };
}

// ---------- sincronización con Meta --------------------------------------

/**
 * Trae de Meta el desempeño de los últimos `dias` y lo escribe.
 *
 * Crea la campaña si es la primera vez que aparece, empatando por
 * `meta_campaign_id`; después sólo actualiza métricas. Nunca borra: si una
 * campaña deja de reportar, sus datos históricos se quedan.
 */
export async function sincronizarConMeta(dias = 30): Promise<Resultado> {
  await exigirRol("admin");

  if (!metaConfigurado()) {
    return {
      ok: false,
      error: "La conexión de lectura publicitaria todavía no está completa.",
    };
  }

  const supabase = await clienteServidor();
  let filas;
  try {
    filas = await traerInsights(haceDias(dias), iso());
  } catch {
    return { ok: false, error: "No se pudieron actualizar los datos publicitarios ahora." };
  }

  if (filas.length === 0) return { ok: true, aviso: "Meta no devolvió datos en el rango." };

  // 1. Alta de las campañas que aún no existen.
  const porMeta = new Map(filas.map((f) => [f.meta_campaign_id, f.nombre]));
  const { data: existentes } = await supabase
    .from("campanas")
    .select("id, meta_campaign_id")
    .in("meta_campaign_id", [...porMeta.keys()]);

  const conocidas = new Map((existentes ?? []).map((c) => [c.meta_campaign_id!, c.id]));
  const nuevas = [...porMeta.entries()].filter(([id]) => !conocidas.has(id));

  if (nuevas.length > 0) {
    const { data: creadas, error } = await supabase
      .from("campanas")
      .insert(nuevas.map(([meta_campaign_id, nombre]) => ({
        nombre,
        meta_campaign_id,
        plataforma: "meta",
        // La lectura de resultados no confirma el estado de entrega. Nunca
        // se interpreta la existencia de métricas como autorización de gasto.
        estado: "borrador" as const,
      })))
      .select("id, meta_campaign_id");
    if (error) {
      console.error("[avansa] No se pudieron registrar campañas leídas:", error.code);
      return { ok: false, error: "No se pudieron registrar las campañas nuevas." };
    }
    for (const c of creadas ?? []) conocidas.set(c.meta_campaign_id!, c.id);
  }

  // 2. Métricas, en un solo upsert.
  const { error } = await supabase.from("metricas_campana").upsert(
    filas.map((f) => ({
      campana_id: conocidas.get(f.meta_campaign_id)!,
      fecha: f.fecha,
      impresiones: f.impresiones,
      alcance: f.alcance,
      clics: f.clics,
      gasto: f.gasto,
      leads: f.leads,
      conversaciones: f.conversaciones,
    })),
    { onConflict: "campana_id,fecha" },
  );

  if (error) {
    console.error("[avansa] No se pudieron guardar las métricas leídas:", error.code);
    return { ok: false, error: "No se pudieron guardar los datos publicitarios." };
  }

  refrescar();
  return {
    ok: true,
    aviso: `${filas.length} días actualizados${nuevas.length ? ` y ${nuevas.length} campañas agregadas al panel` : ""}.`,
  };
}

export async function sincronizarForm(datos: FormData): Promise<void> {
  await sincronizarConMeta(Number(datos.get("dias")) || 30);
}

// ---------- calendario editorial -----------------------------------------

export type ResultadoContenido =
  | { ok: true; id: string; aviso: string }
  | { ok: false; error: string };

const PLATAFORMAS = ["facebook", "instagram"] as const;
const TIPOS_CONTENIDO = ["publicacion", "historia", "reel"] as const;
const ESTADOS_CONTENIDO = ["borrador", "programado"] as const;

/** Crea la pieza antes de subir el archivo directamente al bucket privado. */
export async function guardarContenido(datos: FormData): Promise<ResultadoContenido> {
  const { usuarioId } = await exigirRol("admin");
  const supabase = await clienteServidor();
  const titulo = texto(datos, "titulo", 140);
  if (!titulo) return { ok: false, error: "Ponle un título a la pieza." };

  const plataformas = datos.getAll("plataformas")
    .map(String)
    .filter((plataforma): plataforma is (typeof PLATAFORMAS)[number] =>
      (PLATAFORMAS as readonly string[]).includes(plataforma),
    );
  if (plataformas.length === 0) return { ok: false, error: "Elige Facebook, Instagram o ambos." };

  const tipo = texto(datos, "tipo") as TipoContenidoSocial | null;
  const estado = texto(datos, "estado") as EstadoContenidoSocial | null;
  if (!tipo || !(TIPOS_CONTENIDO as readonly string[]).includes(tipo)) {
    return { ok: false, error: "Elige el formato del contenido." };
  }
  if (!estado || !(ESTADOS_CONTENIDO as readonly string[]).includes(estado)) {
    return { ok: false, error: "Elige si quedará como borrador o programado." };
  }

  const fechaLocal = texto(datos, "programado_para", 40);
  const fechaConvertida = fechaLocal ? fechaLocalMexicoAIso(fechaLocal) : null;
  if (fechaConvertida && !fechaConvertida.ok) return fechaConvertida;
  const programado_para = fechaConvertida?.iso ?? null;
  if (estado === "programado" && !programado_para) {
    return { ok: false, error: "Indica fecha y hora para programar la pieza." };
  }
  if (fechaConvertida && fechaConvertida.instante <= Date.now()) {
    return { ok: false, error: "Elige una fecha y hora futura en Ciudad de México." };
  }

  const { data, error } = await supabase.from("contenidos_sociales").insert({
    titulo,
    texto: String(datos.get("texto") ?? "").trim().slice(0, 5000),
    tipo,
    plataformas,
    estado,
    programado_para,
    creado_por: usuarioId,
    actualizado_por: usuarioId,
  }).select("id").single();

  if (error || !data) {
    if (error) console.error("[avansa] No se pudo crear la pieza:", error.code);
    return { ok: false, error: "No se pudo crear la pieza. Intenta de nuevo." };
  }
  refrescar();
  return {
    ok: true,
    id: data.id,
    aviso: estado === "programado" ? "Contenido programado en el calendario." : "Borrador guardado.",
  };
}

type MedioNuevo = { path: string; mime: string; tipo: "imagen" | "video"; orden: number };

/** Registra archivos que el navegador acaba de subir al bucket privado. */
export async function registrarMediosContenido(contenidoId: string, medios: MedioNuevo[]): Promise<Resultado> {
  await exigirRol("admin");
  if (!/^[0-9a-f-]{36}$/i.test(contenidoId) || medios.length === 0 || medios.length > 10) {
    return { ok: false, error: "Los archivos del contenido no son válidos." };
  }

  const seguros = medios.every((medio) =>
    medio.path.startsWith(`${contenidoId}/`)
    && ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(medio.mime)
    && ["imagen", "video"].includes(medio.tipo),
  );
  if (!seguros) return { ok: false, error: "Un archivo no cumple el formato permitido." };

  const supabase = await clienteServidor();
  const { error } = await supabase.from("contenido_medios").insert(
    medios.map((medio) => ({
      contenido_id: contenidoId,
      storage_path: medio.path,
      mime_type: medio.mime,
      tipo_archivo: medio.tipo,
      orden: medio.orden,
    })),
  );
  if (error) {
    console.error("[avansa] No se pudo registrar el archivo:", error.code);
    return { ok: false, error: "No se pudo agregar el archivo. Intenta de nuevo." };
  }
  refrescar();
  return { ok: true, aviso: "Archivo agregado al contenido." };
}

/**
 * Da la aprobacion humana que habilita al cron. Guardar una fecha nunca
 * publica por si solo: el administrador debe autorizar cuando la pieza y sus
 * archivos ya quedaron completos.
 */
export async function autorizarContenido(contenidoId: string): Promise<Resultado> {
  const { usuarioId } = await exigirRol("admin");
  if (!/^[0-9a-f-]{36}$/i.test(contenidoId)) {
    return { ok: false, error: "La pieza no es valida." };
  }

  const supabase = await clienteServidor();
  // La versión se lee antes que los medios. Cualquier alta, cambio o borrado
  // posterior de un archivo toca `updated_at`; el CAS de abajo lo detecta.
  // Hacer ambas lecturas en paralelo permitiría validar medios viejos junto a
  // una versión nueva y autorizar una combinación que nunca se verificó.
  const { data: contenido, error: contenidoError } = await supabase
    .from("contenidos_sociales")
    .select("*")
    .eq("id", contenidoId)
    .single();
  if (contenidoError || !contenido) {
    if (contenidoError) console.error("[avansa] No se pudo leer la pieza:", contenidoError.code);
    return { ok: false, error: "No se encontró la pieza o no está disponible." };
  }

  const { data: medios, error: mediosError } = await supabase
    .from("contenido_medios")
    .select("*")
    .eq("contenido_id", contenidoId)
    .order("orden");
  if (mediosError) {
    console.error("[avansa] No se pudieron leer los archivos:", mediosError.code);
    return { ok: false, error: "No se pudieron revisar los archivos de la pieza." };
  }
  if (contenido.autorizado_en) return { ok: true, aviso: "La pieza ya estaba autorizada." };
  if (contenido.estado !== "programado" || !contenido.programado_para) {
    return { ok: false, error: "Primero programa una fecha y hora." };
  }

  const plataformas = contenido.plataformas as ("facebook" | "instagram")[];
  const conexion = estadoConfiguracionPublicacion(plataformas);
  if (!conexion.lista) {
    return { ok: false, error: "La conexión de publicación aún no está completa." };
  }
  const activos = await verificarActivosPublicacion(plataformas);
  if (!activos.ok) {
    return { ok: false, error: "La cuenta todavía no tiene todos los permisos de publicación." };
  }

  const resultadoAnterior = leerResultadoMeta(contenido.resultado_meta);
  if (resultadoAnterior.facebook || resultadoAnterior.instagram) {
    return { ok: false, error: "La pieza ya tiene actividad en Meta; revisala antes de volver a autorizar." };
  }

  const validacion = validarPiezaPublicable({
    id: contenido.id,
    titulo: contenido.titulo,
    texto: contenido.texto,
    tipo: contenido.tipo,
    plataformas: contenido.plataformas,
    medios: medios ?? [],
  });
  if (!validacion.ok) return validacion;

  const { data: autorizada, error } = await supabase
    .from("contenidos_sociales")
    .update({
      autorizado_en: new Date().toISOString(),
      autorizado_por: usuarioId,
      actualizado_por: usuarioId,
      error_publicacion: null,
      siguiente_intento_en: null,
    })
    .eq("id", contenidoId)
    .eq("estado", "programado")
    .eq("updated_at", contenido.updated_at)
    .is("autorizado_en", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[avansa] No se pudo autorizar la pieza:", error.code);
    return { ok: false, error: "No se pudo autorizar la pieza. Intenta de nuevo." };
  }
  if (!autorizada) return { ok: false, error: "La pieza cambio mientras se autorizaba; recarga el calendario." };
  refrescar();
  return { ok: true, aviso: "Pieza autorizada. Se enviara a partir de la fecha programada." };
}
