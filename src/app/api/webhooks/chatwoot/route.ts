import { NextResponse } from "next/server";
import {
  firmaValidaChatwoot,
  interpretarEventoChatwoot,
  secretoCompartidoValido,
} from "@/lib/chatwoot/webhook";
import { conversacionPerteneceALaBandeja } from "@/lib/chatwoot/cliente";
import { clienteServicio } from "@/lib/supabase/servicio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const identificadorEntrega = (valor: string | null) =>
  valor && /^[a-zA-Z0-9_-]{8,128}$/.test(valor) ? valor : "sin-id";

/**
 * Receptor de eventos de cuenta de Chatwoot. La Cloud API entrega primero a
 * Chatwoot; este webhook sólo refleja la conversación y ejecuta el reparto.
 */
export async function POST(req: Request) {
  const secreto = process.env.CHATWOOT_WEBHOOK_SECRET;
  const cuentaPermitida = numero(process.env.CHATWOOT_CUENTA_ID);
  const bandejaPermitida = numero(process.env.CHATWOOT_BANDEJA_ID);
  const entrega = identificadorEntrega(req.headers.get("x-chatwoot-delivery"));
  if (!secreto || !cuentaPermitida || !bandejaPermitida) {
    console.error("[avansa] Webhook de conversaciones sin configuración", {
      entrega,
      tieneSecreto: Boolean(secreto),
      tieneCuenta: Boolean(cuentaPermitida),
      tieneBandeja: Boolean(bandejaPermitida),
    });
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 503 });
  }

  const cuerpo = await req.text();
  const url = new URL(req.url);
  const firmaRecibida = req.headers.get("x-chatwoot-signature");
  const timestampRecibido = req.headers.get("x-chatwoot-timestamp");
  const hmacValido = firmaValidaChatwoot(
    cuerpo,
    firmaRecibida,
    timestampRecibido,
    secreto,
  );
  // Compatibilidad con Chatwoot 4.11.x: algunas instalaciones no pueden
  // verificar el secreto que firma los headers. La URL del webhook puede
  // llevar `?secret=<CHATWOOT_WEBHOOK_SECRET>`; se compara en tiempo constante
  // y no sustituye los filtros posteriores de cuenta y bandeja.
  const secretoURLValido = secretoCompartidoValido(
    url.searchParams.get("secret"),
    secreto,
  );
  if (!hmacValido && !secretoURLValido) {
    // Nunca registrar la firma, el timestamp ni el query param: basta saber
    // qué forma de autenticación llegó para diagnosticar una desalineación.
    console.warn("[avansa] Webhook de conversaciones rechazado", {
      entrega,
      tieneFirma: Boolean(firmaRecibida),
      tieneTimestamp: Boolean(timestampRecibido),
      tieneSecretoURL: url.searchParams.has("secret"),
    });
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    console.warn("[avansa] Webhook de conversaciones con JSON inválido", {
      entrega,
    });
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const interpretacion = interpretarEventoChatwoot(payload);
  if (!interpretacion.ok) {
    console.info("[avansa] Evento de conversaciones ignorado", {
      entrega,
      motivo: interpretacion.motivo,
    });
    return NextResponse.json({ ok: true, ignored: true, reason: interpretacion.motivo });
  }
  const datos = interpretacion.datos;
  // Chatwoot 4.11 incluye `account` en message_created, pero no garantiza ese
  // objeto en conversation_created. La autenticación y la bandeja siguen
  // cerrando el alcance; cuando la cuenta sí viene, debe coincidir.
  if (datos.cuentaId !== null && datos.cuentaId !== cuentaPermitida) {
    console.info("[avansa] Evento de conversaciones ignorado", {
      entrega,
      motivo: "otra-cuenta",
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "otra-cuenta" });
  }
  if (datos.bandejaId !== bandejaPermitida) {
    console.info("[avansa] Evento de conversaciones ignorado", {
      entrega,
      motivo: "otra-bandeja",
    });
    return NextResponse.json({ ok: true, ignored: true, reason: "otra-bandeja" });
  }
  if (datos.cuentaId === null) {
    try {
      const verificada = await conversacionPerteneceALaBandeja(datos.conversacionId);
      if (!verificada) {
        console.info("[avansa] Evento de conversaciones ignorado", {
          entrega,
          motivo: "conversacion-no-verificada",
        });
        return NextResponse.json({ ok: true, ignored: true, reason: "conversacion-no-verificada" });
      }
    } catch (causa) {
      console.error("[avansa] No se pudo verificar la conversación entrante", {
        entrega,
        estado: causa && typeof causa === "object" && "estado" in causa ? causa.estado : "desconocido",
      });
      // Un error transitorio debe reintentarse; nunca se persiste PII de una
      // cuenta no confirmada mediante la credencial de la bandeja oficial.
      return NextResponse.json({ error: "No se pudo verificar el evento" }, { status: 503 });
    }
  }

  const supabase = clienteServicio();
  if (!supabase) {
    console.error("[avansa] Servicio de conversaciones sin configuración", {
      entrega,
    });
    return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("registrar_conversacion_whatsapp", {
    p_conversacion_id: datos.conversacionId,
    p_bandeja_id: datos.bandejaId,
    p_nombre: datos.nombre,
    p_telefono: datos.telefono,
    p_email: datos.email,
    p_mensaje_inicial: datos.mensajeInicial,
  });

  if (error) {
    console.error("[avansa] No se pudo sincronizar Chatwoot", {
      entrega,
      codigo: error.code,
    });
    return NextResponse.json({ error: "No se pudo sincronizar" }, { status: 500 });
  }

  console.info("[avansa] Evento de conversaciones sincronizado", {
    entrega,
    evento: datos.evento,
    autenticacion: hmacValido ? "hmac" : "secreto-url",
  });
  return NextResponse.json({ ok: true, assignment: data?.[0] ?? null });
}
