"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { RolUsuario } from "@/lib/supabase/tipos";

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const texto = (fd: FormData, campo: string, max = 160) => {
  const v = String(fd.get(campo) ?? "").trim().slice(0, max);
  return v.length ? v : null;
};

/**
 * Invita a alguien al sistema.
 *
 * El panel no puede crear usuarios de autenticación —eso exige la llave de
 * servicio, que nunca debe vivir en el cliente—, así que se deja una
 * invitación con el correo y el rol. Cuando esa persona se registra con ese
 * correo, el trigger de la base lee la invitación, le asigna el rol y la marca
 * usada. Sin invitación vigente, el alta se rechaza en la base.
 */
export async function invitar(datos: FormData): Promise<Resultado> {
  const sesion = await exigirRol("admin");
  const supabase = await clienteServidor();

  const email = texto(datos, "email")?.toLowerCase();
  const rol = (texto(datos, "rol") ?? "asesor") as RolUsuario;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, error: "Escribe un correo válido." };
  }

  const { error } = await supabase.from("invitaciones").upsert(
    {
      email,
      nombre: texto(datos, "nombre", 120),
      rol,
      invitada_por: sesion.usuarioId,
      usada_en: null,
    },
    { onConflict: "email" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/equipo");
  return {
    ok: true,
    aviso: `${email} ya puede crear su cuenta desde la pantalla de acceso.`,
  };
}

export async function cancelarInvitacion(datos: FormData): Promise<void> {
  await exigirRol("admin");
  const supabase = await clienteServidor();
  await supabase.from("invitaciones").delete().eq("id", String(datos.get("id")));
  revalidatePath("/equipo");
}

export async function cambiarRol(datos: FormData): Promise<void> {
  await exigirRol("admin");
  const supabase = await clienteServidor();

  await supabase
    .from("perfiles")
    .update({ rol: String(datos.get("rol")) as RolUsuario })
    .eq("id", String(datos.get("id")));

  revalidatePath("/equipo");
}

/**
 * Da de baja o reactiva. No borra: los expedientes y los movimientos guardan
 * quién los tocó, y borrar el perfil dejaría huérfana esa historia.
 */
export async function cambiarActivo(datos: FormData): Promise<void> {
  const sesion = await exigirRol("admin");
  const supabase = await clienteServidor();
  const id = String(datos.get("id"));

  // Nadie se da de baja a sí mismo: es la forma más rápida de quedarse sin
  // ningún administrador con acceso.
  if (id === sesion.usuarioId) return;

  await supabase
    .from("perfiles")
    .update({ activo: datos.get("activo") === "si" })
    .eq("id", id);

  revalidatePath("/equipo");
}
