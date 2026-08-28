import { NextResponse } from "next/server";
import {
  firmaValidaChatwoot,
  interpretarEventoChatwoot,
  secretoCompartidoValido,
} from "@/lib/chatwoot/webhook";
import { clienteServicio } from "@/lib/supabase/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Receptor de eventos de cuenta de Chatwoot. La Cloud API entrega primero a
 * Chatwoot; este webhook sólo refleja la conversación y ejecuta el reparto.
 */
export async function POST(req: Request) {
  const secreto = process.env.CHATWOOT_WEBHOOK_SECRET;
  const cuentaPermitida = numero(process.env.CHATWOOT_CUENTA_ID);
  const bandejaPermitida = numero(process.env.CHATWOOT_BANDEJA_ID);
  if (!secreto || !cuentaPermitida || !bandejaPermitida) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  const cuerpo = await req.text();
  const hmacValido = firmaValidaChatwoot(
    cuerpo,
    req.headers.get("x-chatwoot-signature"),
    req.headers.get("x-chatwoot-timestamp"),
    secreto,
  );
  // Compatibilidad con Chatwoot 4.11.x: algunas instalaciones no pueden
  // verificar el secreto que firma los headers. La URL del webhook puede
  // llevar `?secret=<CHATWOOT_WEBHOOK_SECRET>`; se compara en tiempo constante
  // y no sustituye los filtros posteriores de cuenta y bandeja.
  const secretoURLValido = secretoCompartidoValido(
    new URL(req.url).searchParams.get("secret"),
    secreto,
  );
  if (!hmacValido && !secretoURLValido) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const interpretacion = interpretarEventoChatwoot(payload);
  if (!interpretacion.ok) {
    return NextResponse.json({ ok: true, ignored: true, reason: interpretacion.motivo });
  }
  const datos = interpretacion.datos;
  if (datos.cuentaId !== cuentaPermitida) {
    return NextResponse.json({ ok: true, ignored: true, reason: "otra-cuenta" });
  }
  if (datos.bandejaId !== bandejaPermitida) {
    return NextResponse.json({ ok: true, ignored: true, reason: "otra-bandeja" });
  }

  const supabase = clienteServicio();
  if (!supabase) return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });

  const { data, error } = await supabase.rpc("registrar_conversacion_whatsapp", {
    p_conversacion_id: datos.conversacionId,
    p_bandeja_id: datos.bandejaId,
    p_nombre: datos.nombre,
    p_telefono: datos.telefono,
    p_email: datos.email,
    p_mensaje_inicial: datos.mensajeInicial,
  });

  if (error) {
    console.error("[avansa] No se pudo sincronizar Chatwoot:", error.code);
    return NextResponse.json({ error: "No se pudo sincronizar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignment: data?.[0] ?? null });
}
