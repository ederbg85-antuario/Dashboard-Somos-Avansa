/**
 * Lo que este panel consume de Chatwoot, y nada más.
 *
 * Chatwoot devuelve bastante más de lo que aquí aparece. Se declara sólo lo
 * que se usa y casi todo opcional a propósito: la instancia se actualiza por
 * su cuenta (hoy corre 4.11.2 y ya avisa de la 4.17), y un campo que cambie
 * de nombre debe degradar la pantalla, no tumbarla.
 */

/** Emisor de un mensaje. `type` distingue a la persona del negocio. */
export type EmisorCW = {
  id?: number;
  name?: string;
  type?: "contact" | "user" | "agent_bot";
  thumbnail?: string;
};

/**
 * `message_type` viene como número:
 * 0 entrante · 1 saliente · 2 actividad del sistema · 3 plantilla.
 */
export type MensajeCW = {
  id: number;
  content?: string | null;
  message_type?: number;
  created_at?: number;
  private?: boolean;
  status?: string;
  sender?: EmisorCW;
  conversation_id?: number;
  attachments?: {
    id?: number;
    file_type?: string;
    data_url?: string;
    thumb_url?: string;
  }[];
};

export type ContactoCW = {
  id?: number;
  name?: string;
  phone_number?: string | null;
  email?: string | null;
  thumbnail?: string;
};

export type ConversacionCW = {
  id: number;
  inbox_id?: number;
  status?: string;
  unread_count?: number;
  /** Segundos desde epoch, no milisegundos. */
  last_activity_at?: number;
  created_at?: number;
  meta?: {
    sender?: ContactoCW;
    channel?: string;
  };
  /** Chatwoot incluye aquí el último mensaje, que es lo que se ve en la lista. */
  messages?: MensajeCW[];
};

/** Chatwoot marca las horas en segundos; JavaScript las quiere en milisegundos. */
export const aFecha = (segundos: number | undefined | null): string | null =>
  segundos ? new Date(segundos * 1000).toISOString() : null;

export const esEntrante = (m: MensajeCW) => m.message_type === 0;
export const esSaliente = (m: MensajeCW) => m.message_type === 1;
/** Avisos del sistema («conversación resuelta»): no son conversación. */
export const esActividad = (m: MensajeCW) => m.message_type === 2;
