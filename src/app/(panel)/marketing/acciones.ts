"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { metaConfigurado, traerInsights } from "@/lib/meta/insights";
import { haceDias, iso } from "@/lib/formato";
import type { CampanaEstado } from "@/lib/supabase/tipos";

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const texto = (fd: FormData, campo: string, max = 200) => {
  const v = String(fd.get(campo) ?? "").trim().slice(0, max);
  return v.length ? v : null;
};
const entero = (fd: FormData, campo: string) => Math.max(0, Math.round(Number(fd.get(campo)) || 0));
const decimal = (fd: FormData, campo: string) => Math.max(0, Number(fd.get(campo)) || 0);

function refrescar() {
  revalidatePath("/marketing");
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
