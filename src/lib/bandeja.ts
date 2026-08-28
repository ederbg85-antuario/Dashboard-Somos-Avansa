import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { clienteServicio } from "@/lib/supabase/servicio";
import type { Sesion } from "@/lib/supabase/sesion";
import type { LeadEstado } from "@/lib/supabase/tipos";
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
  sinAtender: boolean;
  sinLeer: number;
  asignadoA: string | null;
  asignadoNombre: string | null;
  mia: boolean;
  libre: boolean;
  etapa: LeadEstado | null;
};

export type EstadoBandeja =
  | { listo: false; motivo: "sin-configurar" }
  | { listo: false; motivo: "error"; detalle: string }
  | { listo: true; filas: FilaBandeja[]; total: number; etapasDisponibles: boolean };

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

/** Una salida real o plantilla indica que el negocio ya inició atención. */
function tieneSalidaVisible(c: ConversacionCW): boolean {
  return (c.messages ?? []).some((m) =>
    !esActividad(m) && !m.private && (m.message_type === 1 || m.message_type === 3),
  );
}

/**
 * Respaldo del webhook: registra únicamente conversaciones que aún no existen.
 *
 * Reenviar todas en cada sondeo sería técnicamente idempotente, pero no
 * inocuo: actualizaría `ultima_actividad_en` y dispararía N RPC por usuario
 * cada ocho segundos. Las consultas se parten para no construir un `in(...)`
 * demasiado largo y las altas faltantes se limitan a diez concurrentes.
 */
async function sincronizarFaltantes(deChatwoot: ConversacionCW[]): Promise<void> {
  const servicio = clienteServicio();
  const bandeja = cw.bandejaId;
  if (!servicio || !deChatwoot.length || !bandeja) return;

  const existentes = new Set<number>();
  const TAMANO_CONSULTA = 100;
  for (let inicio = 0; inicio < deChatwoot.length; inicio += TAMANO_CONSULTA) {
    const ids = deChatwoot.slice(inicio, inicio + TAMANO_CONSULTA).map((c) => c.id);
    const { data, error } = await servicio
      .from("conversaciones")
      .select("id")
      .eq("bandeja_id", bandeja)
      .in("id", ids);
    if (error) {
      console.error("[avansa] No se pudo comprobar el respaldo Chatwoot:", error.code);
      return;
    }
    (data ?? []).forEach((fila) => existentes.add(fila.id));
  }

  const faltantes = deChatwoot.filter((c) => !existentes.has(c.id));
  const TAMANO_ALTA = 10;
  for (let inicio = 0; inicio < faltantes.length; inicio += TAMANO_ALTA) {
    await Promise.all(faltantes.slice(inicio, inicio + TAMANO_ALTA).map(async (c) => {
      const contacto = c.meta?.sender;
      if (!contacto?.phone_number) return;
      const { error } = await servicio.rpc("registrar_conversacion_whatsapp", {
        p_conversacion_id: c.id,
        p_bandeja_id: bandeja,
        p_nombre: contacto.name?.trim() || contacto.phone_number,
        p_telefono: contacto.phone_number,
        p_email: contacto.email ?? null,
        p_mensaje_inicial: avanceDe(c),
      });
      if (error) console.error("[avansa] Sincronización Chatwoot:", error.code);
    }));
  }
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

  // El webhook es la vía normal. Este respaldo recupera eventos perdidos
  // cuando el servidor vuelve a estar disponible y sólo usa service_role
  // para invocar el RPC cerrado que asigna en round-robin.
  await sincronizarFaltantes(deChatwoot);

  // La RLS hace el recorte: un asesor sólo recibe las suyas.
  const { data: locales, error: errorLocales } = await supabase
    .from("conversaciones")
    .select("id, asignado_a, lead_id")
    .in("id", deChatwoot.length ? deChatwoot.map((c) => c.id) : [0]);

  if (errorLocales) {
    console.error("[avansa] No se pudo aplicar el alcance RLS de la bandeja:", errorLocales.code);
    return {
      listo: false,
      motivo: "error",
      detalle: "No fue posible verificar qué conversaciones puede consultar esta sesión.",
    };
  }

  const permitidas = new Map((locales ?? []).map((f) => [f.id, f.asignado_a]));
  const leadsPorConversacion = new Map((locales ?? []).map((f) => [f.id, f.lead_id]));
  const idsLead = [...new Set((locales ?? []).flatMap((f) => f.lead_id ? [f.lead_id] : []))];

  const idsConversacion = (locales ?? []).map((fila) => fila.id);
  const [equipoResultado, leadsResultado, respuestasResultado] = await Promise.all([
    supabase.from("perfiles").select("id, nombre"),
    idsLead.length
      ? supabase.from("leads").select("id, estado").in("id", idsLead)
      : Promise.resolve({ data: [], error: null }),
    idsConversacion.length
      ? supabase.from("respuestas").select("conversacion_id").in("conversacion_id", idsConversacion)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const equipo = equipoResultado.data;
  const nombres = new Map((equipo ?? []).map((p) => [p.id, p.nombre]));
  const etapasDisponibles = !leadsResultado.error;
  if (leadsResultado.error) {
    console.error("[avansa] No se pudieron consultar etapas de la bandeja:", leadsResultado.error.code);
  }
  const etapas = new Map(
    ((leadsResultado.data ?? []) as { id: string; estado: LeadEstado }[])
      .map((lead) => [lead.id, lead.estado] as const),
  );
  if (respuestasResultado.error) {
    console.error("[avansa] No se pudo consultar la atención de la bandeja:", respuestasResultado.error.code);
  }
  const atencionDisponible = !respuestasResultado.error;
  const respondidas = new Set(
    (respuestasResultado.data ?? []).map((respuesta) => respuesta.conversacion_id),
  );

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
        sinAtender: atencionDisponible && !respondidas.has(c.id) && !tieneSalidaVisible(c),
        sinLeer: c.unread_count ?? 0,
        asignadoA,
        asignadoNombre: asignadoA ? nombres.get(asignadoA) ?? "Alguien del equipo" : null,
        mia: asignadoA === sesion.usuarioId,
        libre: asignadoA === null,
        etapa: etapas.get(leadsPorConversacion.get(c.id) ?? "") ?? null,
      };
    })
    .sort((a, b) => (b.ultimoEn ?? "").localeCompare(a.ultimoEn ?? ""));

  return {
    listo: true,
    filas,
    // Un asesor no necesita saber cuántas conversaciones pertenecen a otros.
    total: sesion.perfil.rol === "admin" ? deChatwoot.length : filas.length,
    etapasDisponibles,
  };
}

/**
 * ¿Puede esta persona abrir esta conversación?
 *
 * Se pregunta a la tabla bajo RLS, no al rol guardado en la sesión. Además se
 * exige la bandeja oficial para que una URL antigua del inbox demo no alcance
 * los mensajes privilegiados de Chatwoot.
 */
export async function puedeVer(conversacion: number): Promise<boolean> {
  if (!cw.bandejaId) return false;
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("id", conversacion)
    .eq("bandeja_id", cw.bandejaId)
    .maybeSingle();
  return !error && data?.id === conversacion;
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
