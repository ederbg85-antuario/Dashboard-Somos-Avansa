import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPES, googleOAuthConfigurado } from "@/lib/google/cliente";
import { obtenerSesion } from "@/lib/supabase/sesion";

const COOKIE_ESTADO = "avansa_google_oauth_state";

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  if (!sesion || sesion.perfil.rol !== "admin") {
    return NextResponse.redirect(new URL("/sin-acceso", request.url));
  }
  if (!googleOAuthConfigurado()) {
    return NextResponse.redirect(new URL("/marketing?google=sin_configurar", request.url));
  }

  const estado = randomBytes(32).toString("base64url");
  const callback = process.env.GOOGLE_OAUTH_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_DASHBOARD_URL ?? request.nextUrl.origin}/api/integraciones/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_OAUTH_CLIENT_ID!);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", estado);

  const respuesta = NextResponse.redirect(url);
  respuesta.cookies.set(COOKIE_ESTADO, estado, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 10 * 60,
  });
  return respuesta;
}
