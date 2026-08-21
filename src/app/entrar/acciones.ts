"use server";

import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";

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
  redirect(destino.startsWith("/") ? destino : "/");
}

/**
 * Alta de cuenta. La base decide si procede: sin invitación vigente, el
 * trigger `crear_perfil_para_usuario` aborta la inserción y Supabase devuelve
 * el error. La primera cuenta del sistema siempre pasa, y queda como admin.
 */
export async function registrarse(_previo: EstadoAcceso, datos: FormData): Promise<EstadoAcceso> {
  const nombre = leer(datos, "nombre");
  const email = leer(datos, "email").toLowerCase();
  const password = leer(datos, "password");

  if (!nombre || nombre.length < 2) return { error: "Escribe tu nombre completo." };
  if (!email) return { error: "Escribe tu correo." };
  if (password.length < 8) return { error: "La contraseña necesita al menos 8 caracteres." };

  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });

  if (error) return { error: traducir(error.message) };

  // Con confirmación de correo activada, Supabase crea el usuario pero no
  // abre sesión: hay que avisar en vez de dejar la pantalla en blanco.
  if (!data.session) {
    return { aviso: `Cuenta creada. Te enviamos un correo a ${email} para confirmarla; ábrelo y vuelve a entrar.` };
  }

  redirect("/");
}
