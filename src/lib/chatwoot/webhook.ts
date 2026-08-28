import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type Objeto = Record<string, unknown>;

const objeto = (valor: unknown): Objeto =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Objeto
    : {};

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor : null;

const numero = (valor: unknown): number | null => {
  const candidato = Number(valor);
  return Number.isSafeInteger(candidato) && candidato > 0 ? candidato : null;
};

function coincideSecreto(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  // Los digests siempre tienen la misma longitud; así tampoco se filtra la
  // longitud del secreto por abandonar antes de `timingSafeEqual`.
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Compara el secreto compartido sin depender de igualdad de strings. */
export function secretoCompartidoValido(
  recibido: string | null,
  esperado: string,
): boolean {
  return coincideSecreto(recibido, esperado);
}

/** Verifica la firma documentada por Chatwoot sobre el cuerpo sin transformar. */
export function firmaValidaChatwoot(
  cuerpo: string,
  firma: string | null,
  timestamp: string | null,
  secreto: string,
  ahora = Math.floor(Date.now() / 1000),
): boolean {
  if (!firma || !timestamp || !/^\d{10}$/.test(timestamp)) return false;

  const instante = Number(timestamp);
  if (!Number.isSafeInteger(instante) || Math.abs(ahora - instante) > 300) return false;

  const esperada = `sha256=${createHmac("sha256", secreto)
    .update(`${timestamp}.${cuerpo}`)
    .digest("hex")}`;
  return coincideSecreto(firma, esperada);
}

export type EventoChatwoot = {
  evento: "conversation_created" | "message_created";
  conversacionId: number;
  bandejaId: number;
  cuentaId: number | null;
  nombre: string;
  telefono: string;
  email: string | null;
  mensajeInicial: string | null;
};

export type InterpretacionChatwoot =
  | { ok: true; datos: EventoChatwoot }
  | { ok: false; motivo: "evento" | "mensaje-privado" | "sin-contacto" };

/**
 * Normaliza los dos contratos distintos de Chatwoot:
 *
 * - `conversation_created` lleva los atributos de conversación en la raíz.
 * - `message_created` lleva el mensaje en la raíz y la conversación anidada.
 *
 * También prefiere siempre al contacto sobre `sender`: en un mensaje saliente,
 * `sender` es el agente técnico y no la persona que debe convertirse en lead.
 */
export function interpretarEventoChatwoot(valor: unknown): InterpretacionChatwoot {
  const payload = objeto(valor);
  const evento = texto(payload.event);
  if (evento !== "conversation_created" && evento !== "message_created") {
    return { ok: false, motivo: "evento" };
  }
  if (evento === "message_created" && payload.private === true) {
    return { ok: false, motivo: "mensaje-privado" };
  }

  const conversacion = evento === "conversation_created"
    ? payload
    : objeto(payload.conversation);
  const meta = objeto(conversacion.meta);
  const inboxConversacion = objeto(conversacion.inbox);
  const inboxMensaje = objeto(payload.inbox);
  const cuenta = objeto(payload.account);

  const candidatosContacto = [
    objeto(meta.sender),
    objeto(payload.contact),
    objeto(payload.sender),
  ];
  const contacto = candidatosContacto.find((candidato) => texto(candidato.phone_number));

  const conversacionId = numero(
    evento === "conversation_created"
      ? payload.id
      : conversacion.id ?? payload.conversation_id,
  );
  const bandejaId = numero(
    conversacion.inbox_id
      ?? inboxConversacion.id
      ?? payload.inbox_id
      ?? inboxMensaje.id,
  );
  const telefono = texto(contacto?.phone_number);

  if (!conversacionId || !bandejaId || !telefono || !contacto) {
    return { ok: false, motivo: "sin-contacto" };
  }

  let mensajeInicial = texto(payload.content);
  if (!mensajeInicial && Array.isArray(conversacion.messages)) {
    const mensajes = [...conversacion.messages].reverse();
    const mensajeReal = mensajes
      .map(objeto)
      .find((mensaje) => mensaje.private !== true && texto(mensaje.content));
    mensajeInicial = texto(mensajeReal?.content);
  }

  return {
    ok: true,
    datos: {
      evento,
      conversacionId,
      bandejaId,
      cuentaId: numero(payload.account_id ?? conversacion.account_id ?? cuenta.id),
      nombre: texto(contacto.name) ?? telefono,
      telefono,
      email: texto(contacto.email),
      mensajeInicial,
    },
  };
}
