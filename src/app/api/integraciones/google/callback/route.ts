import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { clienteServicio } from "@/lib/supabase/servicio";
import { obtenerSesion } from "@/lib/supabase/sesion";

const COOKIE_ESTADO = "avansa_google_oauth_state";

function regreso(request: NextRequest, estado: string) {
  return NextResponse.redirect(new URL(`/marketing?google=${estado}`, request.url));
}

const coincide = (a: string, b: string) => {
  const uno = Buffer.from(a);
  const dos = Buffer.from(b);
  return uno.length === dos.length && timingSafeEqual(uno, dos);
};

export async function GET(request: NextRequest) {
  const sesion = await obtenerSesion();
  const estado = request.nextUrl.searchParams.get("state");
  const esperado = request.cookies.get(COOKIE_ESTADO)?.value;
  const errorGoogle = request.nextUrl.searchParams.get("error");
  const codigo = request.nextUrl.searchParams.get("code");

  if (!sesion || sesion.perfil.rol !== "admin" || !estado || !esperado || !coincide(estado, esperado)) {
    return regreso(request, "estado_invalido");
  }
  if (errorGoogle || !codigo) return regreso(request, "cancelado");

  const callback = process.env.GOOGLE_OAUTH_REDIRECT_URI
    ?? `${process.env.NEXT_PUBLIC_DASHBOARD_URL ?? request.nextUrl.origin}/api/integraciones/google/callback`;
  const cuerpo = new URLSearchParams({
    code: codigo,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
    redirect_uri: callback,
    grant_type: "authorization_code",
  });

  try {
    const respuesta = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: cuerpo,
      cache: "no-store",
    });
    const datos = await respuesta.json() as { refresh_token?: string; error_description?: string; error?: string };
    if (!respuesta.ok || !datos.refresh_token) {
      return regreso(request, "token_error");
    }

    const servicio = clienteServicio();
    if (!servicio) return regreso(request, "servidor_no_configurado");
    const { error } = await servicio.from("integraciones_google").upsert({
      id: "principal",
      refresh_token: datos.refresh_token,
      conectado_por: sesion.usuarioId,
      conectado_en: new Date().toISOString(),
    });
    if (error) return regreso(request, "guardado_error");

    const listo = regreso(request, "conectado");
    listo.cookies.set(COOKIE_ESTADO, "", { path: "/", maxAge: 0 });
    return listo;
  } catch {
    return regreso(request, "error");
  }
}
