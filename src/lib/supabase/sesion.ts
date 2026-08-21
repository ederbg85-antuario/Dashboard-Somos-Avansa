import { redirect } from "next/navigation";
import { clienteServidor } from "./servidor";
import type { Perfil, RolUsuario } from "./tipos";

/**
 * Sesión del panel: el usuario de auth más su perfil interno.
 *
 * Todas las páginas privadas empiezan llamando a `exigirSesion()`. El
 * middleware ya bloquea el acceso sin cookie, pero esta segunda comprobación
 * es la que importa: es la que corre en el servidor, contra la base, y la que
 * trae el rol con el que se decide qué puede ver la persona.
 */
export type Sesion = { usuarioId: string; email: string; perfil: Perfil };

export async function obtenerSesion(): Promise<Sesion | null> {
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!perfil) return null;

  return { usuarioId: user.id, email: user.email ?? perfil.email, perfil };
}

export async function exigirSesion(): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/entrar");
  if (!sesion.perfil.activo) redirect("/entrar?motivo=inactivo");
  return sesion;
}

/**
 * Como `exigirSesion`, pero además cierra la puerta por rol. Es el candado de
 * Finanzas: aunque alguien escriba la URL a mano, no pasa.
 */
export async function exigirRol(...roles: RolUsuario[]): Promise<Sesion> {
  const sesion = await exigirSesion();
  if (!roles.includes(sesion.perfil.rol)) redirect("/sin-acceso");
  return sesion;
}
