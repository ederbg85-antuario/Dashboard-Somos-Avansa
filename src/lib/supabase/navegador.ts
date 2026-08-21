"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./tipos";

/**
 * Cliente para componentes de cliente. Sólo se usa donde hace falta reaccionar
 * en el navegador (cerrar sesión, suscripciones en vivo); el resto de lecturas
 * y escrituras pasan por Server Actions.
 */
export function clienteNavegador() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
