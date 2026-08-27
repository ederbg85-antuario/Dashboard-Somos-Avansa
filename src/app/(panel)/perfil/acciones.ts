"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";

export type ResultadoPerfil = { ok: true; aviso: string } | { ok: false; error: string };

const valor = (datos: FormData, nombre: string, maximo: number) =>
  String(datos.get(nombre) ?? "").trim().slice(0, maximo);

export async function actualizarPerfil(datos: FormData): Promise<ResultadoPerfil> {
  const sesion = await exigirSesion();
  const nombre = valor(datos, "nombre", 120);
  const apellidos = valor(datos, "apellidos", 160);
  const telefono = valor(datos, "telefono", 30);

  if (nombre.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (apellidos.length < 2) return { ok: false, error: "Escribe tus apellidos." };
  if (telefono && (telefono.match(/\d/g) ?? []).length < 10) {
    return { ok: false, error: "El teléfono necesita al menos 10 dígitos." };
  }

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("perfiles")
    .update({
      nombre,
      apellidos,
      telefono: telefono || null,
      perfil_completo: true,
    })
    .eq("id", sesion.usuarioId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/perfil");
  revalidatePath("/", "layout");
  return { ok: true, aviso: "Perfil actualizado." };
}
