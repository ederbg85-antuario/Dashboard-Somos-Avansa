"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clienteServicio } from "@/lib/supabase/servicio";
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

  if (!(["admin", "asesor"] as RolUsuario[]).includes(rol)) {
    return { ok: false, error: "El rol no es válido." };
  }

  let repartoOrden: number | null = null;
  if (rol === "asesor") {
    const [{ data: perfiles }, { data: pendientes }] = await Promise.all([
      supabase.from("perfiles").select("reparto_orden").eq("rol", "asesor"),
      supabase.from("invitaciones").select("reparto_orden").eq("rol", "asesor").is("usada_en", null),
    ]);
    const usados = [...(perfiles ?? []), ...(pendientes ?? [])]
      .map((fila) => Number(fila.reparto_orden ?? 0));
    repartoOrden = Math.max(0, ...usados) + 1;
  }

  const nombre = texto(datos, "nombre", 120);
  const apellidos = texto(datos, "apellidos", 160);
  const { error } = await supabase.from("invitaciones").upsert(
    {
      email,
      nombre,
      apellidos,
      rol,
      reparto_orden: repartoOrden,
      recibe_leads: rol === "asesor",
      invitada_por: sesion.usuarioId,
      usada_en: null,
    },
    { onConflict: "email" },
  );

  if (error) {
    console.error("[avansa] No se pudo preparar la invitación", { codigo: error.code });
    return { ok: false, error: "No se pudo preparar la invitación. Intenta de nuevo." };
  }

  const servicio = clienteServicio();
  if (!servicio) {
    revalidatePath("/equipo");
    return {
      ok: true,
      aviso: `${email} quedó preparado, pero el envío automático de invitaciones no está disponible.`,
    };
  }

  const base = process.env.NEXT_PUBLIC_DASHBOARD_URL?.replace(/\/+$/, "");
  const { error: errorCorreo } = await servicio.auth.admin.inviteUserByEmail(email, {
    data: { nombre, apellidos },
    redirectTo: base ? `${base}/auth/confirm?next=/bienvenida` : undefined,
  });

  if (errorCorreo) {
    console.error("[avansa] No se pudo enviar la invitación", { codigo: errorCorreo.code });
    return { ok: false, error: "La invitación quedó preparada, pero no se pudo enviar el correo ahora." };
  }

  revalidatePath("/equipo");
  return {
    ok: true,
    aviso: `Invitación enviada a ${email}.`,
  };
}

export async function cancelarInvitacion(datos: FormData): Promise<void> {
  await exigirRol("admin");
  const supabase = await clienteServidor();
  await supabase.from("invitaciones").delete().eq("id", String(datos.get("id")));
  revalidatePath("/equipo");
}

export async function cambiarRol(datos: FormData): Promise<void> {
  const sesion = await exigirRol("admin");
  const supabase = await clienteServidor();
  if (String(datos.get("id")) === sesion.usuarioId) return;
  const rol = String(datos.get("rol")) as RolUsuario;
  if (!(["admin", "asesor"] as RolUsuario[]).includes(rol)) return;

  let repartoOrden: number | null = null;
  if (rol === "asesor") {
    const { data: filas } = await supabase
      .from("perfiles")
      .select("reparto_orden")
      .eq("rol", "asesor")
      .neq("id", String(datos.get("id")));
    repartoOrden = Math.max(0, ...(filas ?? []).map((f) => Number(f.reparto_orden ?? 0))) + 1;
  }

  await supabase
    .from("perfiles")
    .update({
      rol,
      reparto_orden: repartoOrden,
      recibe_leads: rol === "asesor",
    })
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
