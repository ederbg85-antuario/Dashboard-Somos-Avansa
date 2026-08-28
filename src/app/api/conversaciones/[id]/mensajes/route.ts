import { NextResponse } from "next/server";
import { cargarMensajes, puedeVer } from "@/lib/bandeja";
import * as cw from "@/lib/chatwoot/cliente";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerSesion } from "@/lib/supabase/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LARGO_MAX = 4000; // WhatsApp corta en 4096; se deja margen.

/** Mismo trámite en las dos operaciones: sesión, id válido y permiso. */
async function permiso(params: Promise<{ id: string }>) {
  const sesion = await obtenerSesion();
  if (!sesion || !sesion.perfil.activo) {
    return { error: NextResponse.json({ error: "Sin sesión" }, { status: 401 }) };
  }

  const { id } = await params;
  const conversacion = Number(id);
  if (!Number.isInteger(conversacion) || conversacion <= 0) {
    return { error: NextResponse.json({ error: "Conversación inválida" }, { status: 400 }) };
  }

  // 404 y no 403 a propósito: un 403 confirmaría que la conversación existe
  // y es de otra persona, que es justo lo que no queremos revelar.
  if (!(await puedeVer(conversacion))) {
    return { error: NextResponse.json({ error: "No encontrada" }, { status: 404 }) };
  }

  return { sesion, conversacion };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const p = await permiso(ctx.params);
  if (p.error) return p.error;

  try {
    const mensajes = await cargarMensajes(p.conversacion, p.sesion);
    // Cierra la carrera con una reasignación administrativa que ocurra
    // mientras Chatwoot devuelve el hilo.
    if (!(await puedeVer(p.conversacion))) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    // Sólo quien atiende limpia el pendiente. Una visita de supervisión del
    // admin no debe quitarle al asesor su señal de mensaje nuevo.
    if (p.sesion.perfil.rol === "asesor") {
      try {
        await cw.marcarLeida(p.conversacion);
      } catch (e) {
        console.error(
          "[avansa] No se pudo marcar la conversación como leída:",
          e instanceof cw.ErrorChatwoot ? e.estado : "desconocido",
        );
      }
    }
    return NextResponse.json({ mensajes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al leer los mensajes" },
      { status: 502 },
    );
  }
}

/**
 * Responder.
 *
 * A Chatwoot le llega con la identidad de la integración —no tiene otra—, así
 * que quién escribió se guarda aquí en el mismo movimiento. Si esa firma
 * fallara, el mensaje ya salió: se registra el problema pero no se le dice a
 * la persona que falló, porque su mensaje sí llegó.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const p = await permiso(ctx.params);
  if (p.error) return p.error;
  if (p.sesion.perfil.rol !== "asesor") {
    return NextResponse.json(
      { error: "Los administradores tienen acceso de supervisión, no de respuesta." },
      { status: 403 },
    );
  }

  let cuerpo: { texto?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const texto = typeof cuerpo.texto === "string" ? cuerpo.texto.trim() : "";
  if (!texto) return NextResponse.json({ error: "El mensaje viene vacío" }, { status: 400 });
  if (texto.length > LARGO_MAX) {
    return NextResponse.json(
      { error: `El mensaje pasa de ${LARGO_MAX} caracteres` },
      { status: 400 },
    );
  }

  // El permiso pudo cambiar mientras se validaba el cuerpo. Evita responder
  // una conversación que un administrador acaba de entregar a otra persona.
  if (!(await puedeVer(p.conversacion))) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  const supabase = await clienteServidor();

  let enviado;
  try {
    enviado = await cw.responder(p.conversacion, texto);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo enviar" },
      { status: 502 },
    );
  }

  const { error: errorFirma } = await supabase.from("respuestas").insert({
    mensaje_id: enviado.id,
    conversacion_id: p.conversacion,
    autor_id: p.sesion.usuarioId,
  });
  if (errorFirma) {
    // supabase-js devuelve los errores en el resultado; no lanza una
    // excepción. El envío sí ocurrió, así que sólo se registra la anomalía.
    console.error("[avansa] El mensaje salió pero no se pudo firmar:", errorFirma.code);
  }

  return NextResponse.json({ id: enviado.id }, { status: 201 });
}
