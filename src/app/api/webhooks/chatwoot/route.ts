import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clienteServicio } from "@/lib/supabase/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function coincideSecreto(recibido: string | null, esperado: string) {
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function firmaValida(cuerpo: string, firma: string | null, timestamp: string | null, secreto: string) {
  if (!firma || !timestamp || !/^\d{10,}$/.test(timestamp)) return false;

  const instante = Number(timestamp);
  const ahora = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(instante) || Math.abs(ahora - instante) > 300) return false;

  const esperada = `sha256=${createHmac("sha256", secreto)
    .update(`${timestamp}.${cuerpo}`)
    .digest("hex")}`;
  return coincideSecreto(firma, esperada);
}

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => v && typeof v === "object" ? v as Objeto : {};
const texto = (v: unknown) => typeof v === "string" ? v : null;
const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Receptor de eventos de cuenta de Chatwoot. La Cloud API entrega primero a
 * Chatwoot; este webhook sólo refleja la conversación y ejecuta el reparto.
 */
export async function POST(req: Request) {
  const secreto = process.env.CHATWOOT_WEBHOOK_SECRET;
  const bandejaPermitida = numero(process.env.CHATWOOT_BANDEJA_ID);
  if (!secreto || !bandejaPermitida) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  const cuerpo = await req.text();
  if (!firmaValida(
    cuerpo,
    req.headers.get("x-chatwoot-signature"),
    req.headers.get("x-chatwoot-timestamp"),
    secreto,
  )) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: Objeto;
  try {
    payload = objeto(JSON.parse(cuerpo));
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const evento = texto(payload.event);
  if (evento !== "conversation_created" && evento !== "message_created") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const conversacion = objeto(payload.conversation);
  const meta = objeto(conversacion.meta);
  const emisorMeta = objeto(meta.sender);
  const emisorMensaje = objeto(payload.sender);
  const contacto = Object.keys(emisorMeta).length ? emisorMeta : emisorMensaje;
  const inbox = objeto(conversacion.inbox);

  const conversacionId = numero(conversacion.id ?? payload.conversation_id);
  const bandejaId = numero(conversacion.inbox_id ?? inbox.id);
  const telefono = texto(contacto.phone_number);

  if (!conversacionId || !bandejaId || !telefono) {
    return NextResponse.json({ ok: true, ignored: true, reason: "sin-contacto" });
  }
  if (bandejaId !== bandejaPermitida) {
    return NextResponse.json({ ok: true, ignored: true, reason: "otra-bandeja" });
  }

  const supabase = clienteServicio();
  if (!supabase) return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });

  const { data, error } = await supabase.rpc("registrar_conversacion_whatsapp", {
    p_conversacion_id: conversacionId,
    p_bandeja_id: bandejaId,
    p_nombre: texto(contacto.name) ?? telefono,
    p_telefono: telefono,
    p_email: texto(contacto.email),
    p_mensaje_inicial: texto(payload.content),
  });

  if (error) {
    console.error("[avansa] No se pudo sincronizar Chatwoot:", error.code);
    return NextResponse.json({ error: "No se pudo sincronizar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, assignment: data?.[0] ?? null });
}
