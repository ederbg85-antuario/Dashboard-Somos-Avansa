import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./tipos";

/**
 * Cliente reservado a webhooks del servidor. Nunca se importa desde UI ni se
 * expone con NEXT_PUBLIC_. Si falta la clave, la integración queda inactiva.
 */
export function clienteServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;

  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
