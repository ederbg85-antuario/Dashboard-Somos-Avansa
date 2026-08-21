import "server-only";
import type { ConversacionCW, MensajeCW } from "./tipos";

/**
 * Acceso a Chatwoot. **Sólo servidor.**
 *
 * El `import "server-only"` no es decorativo: el token de esta integración
 * puede leer y responder toda la bandeja de avansa, así que si algún día
 * alguien lo importa desde un componente de cliente, esto rompe la
 * compilación en vez de publicar la credencial en el bundle.
 *
 * Nada de este módulo decide *quién* puede ver qué. Eso vive en
 * `lib/bandeja.ts`, contra la base. Aquí sólo se habla con Chatwoot.
 */

const URL_BASE = process.env.CHATWOOT_URL?.replace(/\/+$/, "");
const TOKEN = process.env.CHATWOOT_TOKEN;
const CUENTA = process.env.CHATWOOT_CUENTA_ID;
const BANDEJA = process.env.CHATWOOT_BANDEJA_ID;

/** `true` cuando la integración está configurada. La pantalla lo consulta
 *  para explicar qué falta en vez de reventar con un error opaco. */
export const hayChatwoot = Boolean(URL_BASE && TOKEN && CUENTA);

/** Bandeja a la que se limita el panel, si se fijó una. */
export const bandejaId = BANDEJA ? Number(BANDEJA) : null;

export class ErrorChatwoot extends Error {
  constructor(readonly estado: number, mensaje: string) {
    super(mensaje);
    this.name = "ErrorChatwoot";
  }
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  if (!hayChatwoot) {
    throw new ErrorChatwoot(503, "Chatwoot no está configurado en este entorno.");
  }

  const respuesta = await fetch(`${URL_BASE}/api/v1/accounts/${CUENTA}${ruta}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      api_access_token: TOKEN!,
      ...init?.headers,
    },
    // La bandeja es lo más vivo del panel: cachearla mostraría mensajes
    // viejos, que en atención a leads es peor que tardar 200 ms más.
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => "");
    throw new ErrorChatwoot(
      respuesta.status,
      `Chatwoot respondió ${respuesta.status} a ${ruta}. ${cuerpo.slice(0, 300)}`,
    );
  }

  return respuesta.json() as Promise<T>;
}

/**
 * Conversaciones de la bandeja.
 *
 * Chatwoot pagina de 25 en 25 y envuelve el resultado en `data.payload`.
 * Se piden abiertas y pendientes: una conversación resuelta ya no es trabajo
 * por hacer y llenaría la lista de ruido.
 */
export async function conversaciones(): Promise<ConversacionCW[]> {
  const busca = new URLSearchParams({ status: "open", sort_by: "last_activity_at" });
  if (bandejaId) busca.set("inbox_id", String(bandejaId));

  const r = await pedir<{ data?: { payload?: ConversacionCW[] } }>(
    `/conversations?${busca}`,
  );
  return r.data?.payload ?? [];
}

/** Mensajes de una conversación, del más viejo al más nuevo. */
export async function mensajes(conversacion: number): Promise<MensajeCW[]> {
  const r = await pedir<{ payload?: MensajeCW[] }>(
    `/conversations/${conversacion}/messages`,
  );
  return r.payload ?? [];
}

/** Responde en la conversación. Sale como mensaje del negocio, no como nota. */
export async function responder(
  conversacion: number,
  contenido: string,
): Promise<MensajeCW> {
  return pedir<MensajeCW>(`/conversations/${conversacion}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: contenido, message_type: "outgoing" }),
  });
}

/** Marca la conversación como resuelta o la vuelve a abrir. */
export async function cambiarEstado(
  conversacion: number,
  estado: "open" | "resolved",
): Promise<void> {
  await pedir(`/conversations/${conversacion}/toggle_status`, {
    method: "POST",
    body: JSON.stringify({ status: estado }),
  });
}
