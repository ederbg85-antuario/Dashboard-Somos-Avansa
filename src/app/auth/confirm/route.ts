import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";
import { rutaInterna } from "@/lib/ruta-interna";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const siguiente = url.searchParams.get("next") || "/bienvenida";

  if (tokenHash && tipo) {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(rutaInterna(siguiente, "/bienvenida"), url.origin));
    }
  }

  return NextResponse.redirect(new URL("/entrar?motivo=enlace-invalido", url.origin));
}
