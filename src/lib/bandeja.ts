import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clienteServicio } from "@/lib/supabase/servicio";
import type { Sesion } from "@/lib/supabase/sesion";
import * as cw from "@/lib/chatwoot/cliente";
import { aFecha, esActividad, type ConversacionCW } from "@/lib/chatwoot/tipos";

/**
 * La bandeja, ya recortada a lo que quien pregunta puede ver.
 *
 * Aquí está el candado del que depende todo lo demás: el filtro se aplica en
 * el servidor, **antes** de devolver nada. La pantalla no oculta filas — no
 * las recibe. Y la regla no se escribe dos veces: la misma condición vive en
 * la RLS de `conversaciones`, así que consultar la tabla ya devuelve
 * únicamente lo permitido.
 */

export type FilaBandeja = {
  id: number;
  nombre: string;
  telefono: string | null;
  avance: string;
  ultimoEn: string | null;
  entranteSinResponder: boolean;
  sinLeer: number;
  asignadoA: string | null;
  asignadoNombre: string | null;
  mia: boolean;
  libre: boolean;
};

export type EstadoBandeja =
  | { listo: false; motivo: "sin-configurar" }
  | { listo: false; motivo: "error"; detalle: string }
  | { listo: true; filas: FilaBandeja[]; total: number };

/** Texto de una conversación en la lista: el último mensaje de verdad. */
function avanceDe(c: ConversacionCW): string {
  const reales = (c.messages ?? []).filter((m) => !esActividad(m) && !m.private);
  const ultimo = reales.at(-1);
  const texto = (ultimo?.content ?? "").replace(/\s+/g, " ").trim();
  if (texto) return texto;
  return ultimo?.attachments?.length ? "📎 Archivo adjunto" : "Sin mensajes todavía";
}

/** `true` si lo último que pasó fue que escribió la persona. */
function esperaRespuesta(c: ConversacionCW): boolean {
  const reales = (c.messages ?? []).filter((m) => !esActividad(m) && !m.private);
  return reales.at(-1)?.message_type === 0;
}

export async function cargarBandeja(sesion: Sesion): Promise<EstadoBandeja> {
  if (!cw.hayChatwoot) return { listo: false, motivo: "sin-configurar" };

  let deChatwoot: ConversacionCW[];
  try {
    deChatwoot = await cw.conversaciones();
  } catch (e) {
    return {
      listo: false,
      motivo: "error",
      detalle: e instanceof Error ? e.message : "Error desconocido",
    };
  }

  const supabase = await clienteServidor();

  // El webhook es la vía normal. Este respaldo idempotente recupera eventos
  // perdidos cuando el servidor vuelve a estar disponible. Usa service_role
  // únicamente para invocar el RPC cerrado que asigna en round-robin.
  const servicio = clienteServicio();
  if (servicio && deChatwoot.length) {
    await Promise.all(deChatwoot.map(async (c) => {
      const contacto = c.meta?.sender;
      if (!contacto?.phone_number) return;
      const { error } = await servicio.rpc("registrar_conversacion_whatsapp", {
        p_conversacion_id: c.id,
        p_bandeja_id: c.inbox_id ?? cw.bandejaId ?? 0,
        p_nombre: contacto.name?.trim() || contacto.phone_number,
        p_telefono: contacto.phone_number,
        p_email: contacto.email ?? null,
        p_mensaje_inicial: avanceDe(c),
      });
      if (error) console.error("[avansa] Sincronización Chatwoot:", error.code);
    }));
  }

  // La RLS hace el recorte: un asesor sólo recibe las suyas.
  const { data: locales } = await supabase
    .from("conversaciones")
    .select("id, asignado_a")
    .in("id", deChatwoot.length ? deChatwoot.map((c) => c.id) : [0]);

  const permitidas = new Map((locales ?? []).map((f) => [f.id, f.asignado_a]));

  const { data: equipo } = await supabase.from("perfiles").select("id, nombre");
  const nombres = new Map((equipo ?? []).map((p) => [p.id, p.nombre]));

  const filas = deChatwoot
    .filter((c) => permitidas.has(c.id))
    .map((c): FilaBandeja => {
      const asignadoA = permitidas.get(c.id) ?? null;
      return {
        id: c.id,
        nombre: c.meta?.sender?.name?.trim() || "Sin nombre",
        telefono: c.meta?.sender?.phone_number ?? null,
        avance: avanceDe(c),
        ultimoEn: aFecha(c.last_activity_at ?? c.created_at),
        entranteSinResponder: esperaRespuesta(c),
        sinLeer: c.unread_count ?? 0,
        asignadoA,
        asignadoNombre: asignadoA ? nombres.get(asignadoA) ?? "Alguien del equipo" : null,
        mia: asignadoA === sesion.usuarioId,
        libre: asignadoA === null,
      };
    })
    .sort((a, b) => (b.ultimoEn ?? "").localeCompare(a.ultimoEn ?? ""));

  return {
    listo: true,
    filas,
    // Un asesor no necesita saber cuántas conversaciones pertenecen a otros.
    total: sesion.perfil.rol === "admin" ? deChatwoot.length : filas.length,
  };
}

/**
 * ¿Puede esta persona abrir esta conversación?
 *
 * Se pregunta a la base, no a la sesión: es la misma función que usa la RLS,
 * así que la respuesta no puede discrepar de lo que la tabla dejaría leer.
 */
export async function puedeVer(conversacion: number): Promise<boolean> {
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("puede_ver_conversacion", {
    conv: conversacion,
  });
  return !error && data === true;
}

export type MensajeBandeja = {
  id: number;
  texto: string;
  mio: boolean;
  entrante: boolean;
  en: string | null;
  autor: string | null;
  adjuntos: { url: string; tipo: string }[];
};

/** Los mensajes de una conversación, con la firma de quién respondió. */
export async function cargarMensajes(
  conversacion: number,
  sesion: Sesion,
): Promise<MensajeBandeja[]> {
  const [crudos, supabase] = await Promise.all([
    cw.mensajes(conversacion),
    clienteServidor(),
  ]);

  const { data: firmas } = await supabase
    .from("respuestas")
    .select("mensaje_id, autor_id")
    .eq("conversacion_id", conversacion);

  const { data: equipo } = await supabase.from("perfiles").select("id, nombre");
  const nombres = new Map((equipo ?? []).map((p) => [p.id, p.nombre]));
  const autores = new Map((firmas ?? []).map((f) => [f.mensaje_id, f.autor_id]));

  return crudos
    .filter((m) => !esActividad(m) && !m.private)
    .map((m): MensajeBandeja => {
      const autorId = autores.get(m.id) ?? null;
      return {
        id: m.id,
        texto: m.content ?? "",
        entrante: m.message_type === 0,
        mio: autorId === sesion.usuarioId,
        en: aFecha(m.created_at),
        // Sin firma local el mensaje se envió desde Chatwoot, no desde aquí.
        autor: autorId ? nombres.get(autorId) ?? "Equipo" : null,
        adjuntos: (m.attachments ?? [])
          .filter((a) => a.data_url)
          .map((a) => ({ url: a.data_url!, tipo: a.file_type ?? "file" })),
      };
    });
}
