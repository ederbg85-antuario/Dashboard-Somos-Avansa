"use server";

import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { rutaInterna } from "@/lib/ruta-interna";

export type EstadoAcceso = { error?: string; aviso?: string };

const leer = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

/** Traduce los mensajes de Supabase, que llegan en inglés y en jerga. */
function traducir(mensaje: string): string {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Falta confirmar el correo. Revisa tu bandeja de entrada.";
  if (m.includes("user already registered")) return "Ese correo ya tiene cuenta. Entra con tu contraseña.";
  if (m.includes("invitación vigente") || m.includes("invitacion vigente")) {
    return "Ese correo no tiene una invitación vigente. Pídele a un administrador que te invite.";
  }
  if (m.includes("password should be at least")) return "La contraseña necesita al menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.";
  }
  return mensaje;
}

export async function entrar(_previo: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  const email = leer(datos, "email").toLowerCase();
  const password = leer(datos, "password");
  const destino = leer(datos, "destino") || "/";

  if (!email || !password) return { error: "Escribe tu correo y tu contraseña." };

  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: traducir(error.message) };

  // `redirect` lanza para cortar la ejecución: tiene que quedar fuera de
  // cualquier try/catch o se traga la redirección.
  redirect(rutaInterna(destino, "/"));
}
