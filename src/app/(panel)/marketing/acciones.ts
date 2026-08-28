"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { metaConfigurado, traerInsights } from "@/lib/meta/insights";
import { haceDias, iso } from "@/lib/formato";
import type { CampanaEstado, EstadoContenidoSocial, TipoContenidoSocial } from "@/lib/supabase/tipos";

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
  revalidatePath("/marketing/search-console");
  revalidatePath("/marketing/instagram");
  revalidatePath("/marketing/contenido");
  revalidatePath("/");
}

// ---------- campañas ------------------------------------------------------

export async function guardarCampana(datos: FormData): Promise<Resultado> {
  await exigirRol("admin");
  const supabase = await clienteServidor();

  const nombre = texto(datos, "nombre", 160);
  if (!nombre) return { ok: false, error: "La campaña necesita nombre." };

  const fila = {
    nombre,
    objetivo: texto(datos, "objetivo", 80),
    estado: (texto(datos, "estado") ?? "activa") as CampanaEstado,
    publico: texto(datos, "publico", 200),
    meta_campaign_id: texto(datos, "meta_campaign_id", 60),
    fecha_inicio: texto(datos, "fecha_inicio", 10),
    fecha_fin: texto(datos, "fecha_fin", 10),
    presupuesto_diario: decimal(datos, "presupuesto_diario") || null,
    notas: texto(datos, "notas", 1000),
  };

  const id = texto(datos, "id");
  const { error } = id
    ? await supabase.from("campanas").update(fila).eq("id", id)
    : await supabase.from("campanas").insert(fila);

  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "Ya existe una campaña con ese identificador de Meta."
        : error.message,
    };
  }

  refrescar();
  return { ok: true, aviso: id ? "Campaña actualizada." : `Campaña «${nombre}» creada.` };
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

  if (error) return { ok: false, error: error.message };
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
      error: "Falta configurar META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en el entorno.",
    };
  }

  const supabase = await clienteServidor();
  let filas;
  try {
    filas = await traerInsights(haceDias(dias), iso());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Meta no respondió." };
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
      .insert(nuevas.map(([meta_campaign_id, nombre]) => ({ nombre, meta_campaign_id, plataforma: "meta" })))
      .select("id, meta_campaign_id");
    if (error) return { ok: false, error: `No se pudieron crear las campañas nuevas: ${error.message}` };
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

  if (error) return { ok: false, error: error.message };

  refrescar();
  return {
    ok: true,
    aviso: `${filas.length} días sincronizados${nuevas.length ? ` y ${nuevas.length} campañas nuevas` : ""}.`,
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
  const programado_para = fechaLocal ? new Date(fechaLocal).toISOString() : null;
  if (estado === "programado" && !programado_para) {
    return { ok: false, error: "Indica fecha y hora para programar la pieza." };
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

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la pieza." };
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
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true, aviso: "Archivo agregado al contenido." };
}
