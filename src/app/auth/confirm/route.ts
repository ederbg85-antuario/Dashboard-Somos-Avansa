import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { rutaInterna } from "@/lib/ruta-interna";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const codigo = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const siguiente = url.searchParams.get("next") || "/bienvenida";
  const supabase = await clienteServidor();

  if (tokenHash && tipo) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(rutaInterna(siguiente, "/bienvenida"), url.origin));
    }
  }

  // Compatibilidad con enlaces PKCE generados por `resetPasswordForEmail`.
  // Las plantillas de avansa usan TokenHash para funcionar incluso al abrir el
  // correo en otro navegador, pero aceptar `code` evita volver a romper el
  // flujo si Supabase cambia la plantilla al formato recomendado para PKCE.
  if (codigo) {
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      return NextResponse.redirect(new URL(rutaInterna(siguiente, "/bienvenida"), url.origin));
    }
  }

  return NextResponse.redirect(new URL("/entrar?motivo=enlace-invalido", url.origin));
}
