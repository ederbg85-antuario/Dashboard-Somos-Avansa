"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";
import { ETAPA } from "@/lib/constantes";

/**
 * «Tomar» una solicitud: la asigna a quien la toma y la pasa a Contactado en
 * un solo gesto. Es la acción que más se repite en la bandeja, y partirla en
 * dos pasos garantiza que la mitad de los expedientes queden sin dueño.
 */
export async function tomarSolicitud(datos: FormData): Promise<void> {
  const sesion = await exigirSesion();
  const supabase = await clienteServidor();
  const id = String(datos.get("id"));

  await supabase
    .from("leads")
    .update({
      asesor_id: sesion.usuarioId,
      estado: "contactado",
      probabilidad: ETAPA.contactado.probabilidad,
      proxima_accion: "Primer contacto por WhatsApp",
      fecha_proxima_accion: new Date().toISOString().slice(0, 10),
    })
    .eq("id", id)
    .eq("estado", "nuevo");   // no reabre algo que alguien ya movió

  await supabase.from("actividades").insert({
    lead_id: id,
    autor_id: sesion.usuarioId,
    tipo: "sistema",
    titulo: `${sesion.perfil.nombre} tomó la solicitud`,
  });

  revalidatePath("/solicitudes");
  revalidatePath("/crm");
  revalidatePath("/");
}
