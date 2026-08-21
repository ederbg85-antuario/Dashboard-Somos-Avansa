"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

/**
 * Borra de un golpe todo lo sembrado como demostración.
 *
 * Es lo primero que hay que hacer antes de operar de verdad, y por eso no se
 * deja como un script suelto que alguien tiene que encontrar: es un botón, y
 * sólo borra lo que lleva `es_demo = true`. Lo que capture el equipo nunca
 * lleva esa marca, así que no hay forma de que este botón se lleve datos
 * reales por delante.
 */
export async function borrarDatosDemo(): Promise<Resultado> {
  await exigirRol("admin");
  const supabase = await clienteServidor();

  // Orden importa: los movimientos y las métricas apuntan a leads y campañas.
  const movimientos = await supabase.from("movimientos").delete().eq("es_demo", true).select("id");
  if (movimientos.error) return { ok: false, error: movimientos.error.message };

  const metricas = await supabase.from("metricas_campana").delete().eq("es_demo", true).select("id");
  if (metricas.error) return { ok: false, error: metricas.error.message };

  // `actividades` y `documentos` caen solos por `on delete cascade`.
  const leads = await supabase.from("leads").delete().eq("es_demo", true).select("id");
  if (leads.error) return { ok: false, error: leads.error.message };

  const campanas = await supabase.from("campanas").delete().eq("es_demo", true).select("id");
  if (campanas.error) return { ok: false, error: campanas.error.message };

  revalidatePath("/", "layout");

  const n = (r: { data: unknown[] | null }) => r.data?.length ?? 0;
  return {
    ok: true,
    aviso: `Listo: ${n(leads)} expedientes, ${n(movimientos)} movimientos, ${n(campanas)} campañas y ${n(metricas)} días de métrica de demostración.`,
  };
}
