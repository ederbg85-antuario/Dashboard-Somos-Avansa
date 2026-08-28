import "server-only";
import { clienteServicio } from "@/lib/supabase/servicio";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

type TokenGoogle = { access_token: string; expires_in: number; token_type: string };

export function googleOAuthConfigurado() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Entrega un token corto para consultar los dos activos de avansa. El refresh
 * token nunca sale de este módulo ni se expone a un componente de cliente.
 */
export async function tokenGoogle(): Promise<string | null> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const servicio = clienteServicio();
  if (!clientId || !clientSecret || !servicio) return null;

  const { data: conexion, error: errorConexion } = await servicio
    .from("integraciones_google")
    .select("refresh_token")
    .eq("id", "principal")
    .maybeSingle();

  if (errorConexion || !conexion?.refresh_token) return null;

  const cuerpo = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: conexion.refresh_token,
    grant_type: "refresh_token",
  });

  const respuesta = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo,
    cache: "no-store",
  });
  const datos = await respuesta.json() as TokenGoogle & { error?: string; error_description?: string };

  if (!respuesta.ok || !datos.access_token) {
    throw new Error(datos.error_description ?? datos.error ?? "Google no pudo renovar la conexión.");
  }

  return datos.access_token;
}

export async function googleConectado() {
  if (!googleOAuthConfigurado()) return false;
  const servicio = clienteServicio();
  if (!servicio) return false;
  const { data } = await servicio
    .from("integraciones_google")
    .select("id")
    .eq("id", "principal")
    .maybeSingle();
  return Boolean(data);
}
