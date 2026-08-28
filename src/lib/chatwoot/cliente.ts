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

/** Cuenta a la que pertenece la credencial técnica. */
export const cuentaId = CUENTA ? Number(CUENTA) : null;
/** Bandeja a la que se limita el panel, si se fijó una. */
export const bandejaId = BANDEJA ? Number(BANDEJA) : null;

/** `true` sólo cuando la integración está cerrada sobre una bandeja concreta.
 *  El ID no es opcional: sin él, Chatwoot devolvería conversaciones de otras
 *  bandejas de la cuenta y el respaldo idempotente podría repartir pruebas
 *  como leads reales. */
export const hayChatwoot = Boolean(
  URL_BASE
  && TOKEN
  && cuentaId
  && Number.isSafeInteger(cuentaId)
  && cuentaId > 0
  && bandejaId
  && Number.isSafeInteger(bandejaId)
  && bandejaId > 0,
);

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

  const respuesta = await fetch(`${URL_BASE}/api/v1/accounts/${cuentaId}${ruta}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      api_access_token: TOKEN!,
      ...init?.headers,
    },
    // La bandeja es lo más vivo del panel: cachearla mostraría mensajes
    // viejos, que en atención a leads es peor que tardar 200 ms más.
    cache: "no-store",
    // Un upstream abierto sin responder no debe dejar colgada la carga del
    // panel ni acumular sondeos concurrentes en el navegador.
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });

  if (!respuesta.ok) {
    throw new ErrorChatwoot(
      respuesta.status,
      `Chatwoot respondió ${respuesta.status} al consultar la bandeja.`,
    );
  }

  if (respuesta.status === 204) return undefined as T;
  const cuerpo = await respuesta.text();
  if (!cuerpo) return undefined as T;
  try {
    return JSON.parse(cuerpo) as T;
  } catch {
    throw new ErrorChatwoot(502, `Chatwoot devolvió JSON inválido a ${ruta}.`);
  }
}

/**
 * Conversaciones de la bandeja.
 *
 * Chatwoot pagina de 25 en 25 y envuelve el resultado en `data.payload`.
 * Se piden abiertas y pendientes: una conversación resuelta ya no es trabajo
 * por hacer y llenaría la lista de ruido.
 */
export async function conversaciones(): Promise<ConversacionCW[]> {
  async function porEstado(status: "open" | "pending") {
    const acumuladas: ConversacionCW[] = [];

    // Chatwoot entrega 25 por página. El límite de 20 páginas evita que una
    // configuración errónea convierta cada refresco en un recorrido infinito.
    for (let pagina = 1; pagina <= 20; pagina += 1) {
      const busca = new URLSearchParams({
        status,
        sort_by: "last_activity_at",
        page: String(pagina),
      });
      if (bandejaId) busca.set("inbox_id", String(bandejaId));

      const r = await pedir<{ data?: { payload?: ConversacionCW[] } }>(
        `/conversations?${busca}`,
      );
      // El query de Chatwoot ya pide una bandeja, pero el filtro local es el
      // límite de confianza: ninguna respuesta inesperada de otra bandeja se
      // sincroniza ni llega a la pantalla.
      const loteCrudo = r.data?.payload ?? [];
      const lote = loteCrudo
        .filter((conversacion) => conversacion.inbox_id === bandejaId);
      acumuladas.push(...lote);
      if (loteCrudo.length < 25) break;
    }

    return acumuladas;
  }

  const juntas = (await Promise.all([porEstado("open"), porEstado("pending")])).flat();
  return [...new Map(juntas.map((conversacion) => [conversacion.id, conversacion])).values()];
}

/** Mensajes de una conversación, del más viejo al más nuevo. */
export async function mensajes(conversacion: number): Promise<MensajeCW[]> {
  const acumulados: MensajeCW[] = [];
  let antesDe: number | null = null;

  // Chatwoot entrega 20 por página al retroceder. Cien mensajes recientes
  // cubren el contexto operativo sin convertir la apertura de un chat largo
  // en un recorrido sin límite.
  for (let pagina = 0; pagina < 5; pagina += 1) {
    const sufijo = antesDe === null ? "" : `?before=${antesDe}`;
    let r: { payload?: MensajeCW[] };
    try {
      r = await pedir<{ payload?: MensajeCW[] }>(
        `/conversations/${conversacion}/messages${sufijo}`,
      );
    } catch (causa) {
      if (acumulados.length === 0) throw causa;
      break;
    }

    const lote = (r.payload ?? []).filter((mensaje) => Number.isSafeInteger(mensaje.id) && mensaje.id > 0);
    acumulados.push(...lote);
    if (lote.length < 20) break;

    const masAntiguo = Math.min(...lote.map((mensaje) => mensaje.id));
    if (!Number.isSafeInteger(masAntiguo) || masAntiguo <= 0 || masAntiguo === antesDe) break;
    antesDe = masAntiguo;
  }

  return [...new Map(acumulados.map((mensaje) => [mensaje.id, mensaje])).values()]
    .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0) || a.id - b.id);
}

/** Limpia el contador de no leídos de la identidad técnica de la bandeja. */
export async function marcarLeida(conversacion: number): Promise<void> {
  await pedir(`/conversations/${conversacion}/update_last_seen`, {
    method: "POST",
  });
}

/** Responde en la conversación. Sale como mensaje del negocio, no como nota. */
export async function responder(
  conversacion: number,
  contenido: string,
): Promise<MensajeCW> {
  const mensaje = await pedir<MensajeCW>(`/conversations/${conversacion}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: contenido,
      message_type: "outgoing",
      private: false,
      content_type: "text",
    }),
  });

  if (
    !mensaje
    || !Number.isSafeInteger(mensaje.id)
    || mensaje.id <= 0
    || (mensaje.conversation_id !== undefined && mensaje.conversation_id !== conversacion)
    || (mensaje.message_type !== undefined && mensaje.message_type !== 1)
  ) {
    throw new ErrorChatwoot(502, "Chatwoot devolvió un mensaje saliente inválido.");
  }
  return mensaje;
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
