import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./tipos";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Usa la clave pública: **toda** la autorización vive en las políticas RLS de
 * la base. Aquí no hay `service_role` a propósito — si un día se filtra este
 * bundle, no se filtra nada que la sesión del usuario no pudiera ver ya.
 */
export async function clienteServidor() {
  const almacen = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll(porEscribir) {
          try {
            porEscribir.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            );
          } catch {
            // Un Server Component no puede escribir cookies. No importa: el
            // middleware ya refrescó la sesión en esta misma petición.
          }
        },
      },
    },
  );
}

/** `true` cuando el proyecto tiene credenciales de Supabase configuradas. */
export const hayCredenciales = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
