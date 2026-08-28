import { NextResponse } from "next/server";
import * as cw from "@/lib/chatwoot/cliente";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerSesion } from "@/lib/supabase/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reasignación administrativa del lead completo y su conversación ligada. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion || !sesion.perfil.activo) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }
  if (sesion.perfil.rol !== "admin") {
    return NextResponse.json({ error: "Sólo un administrador puede reasignar." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const conversacion = Number(id);
  if (!Number.isInteger(conversacion) || conversacion <= 0) {
    return NextResponse.json({ error: "Conversación inválida" }, { status: 400 });
  }

  let cuerpo: { a?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const destino = typeof cuerpo.a === "string" ? cuerpo.a : "";
  if (!destino) return NextResponse.json({ error: "Elige un asesor." }, { status: 400 });
  if (!cw.hayChatwoot || !cw.bandejaId) {
    return NextResponse.json({ error: "La bandeja oficial no está configurada." }, { status: 503 });
  }

  const supabase = await clienteServidor();
  const [{ data: local }, { data: asesor }] = await Promise.all([
    supabase
      .from("conversaciones")
      .select("lead_id")
      .eq("id", conversacion)
      .eq("bandeja_id", cw.bandejaId)
      .maybeSingle(),
    supabase.from("perfiles").select("id").eq("id", destino).eq("rol", "asesor").eq("activo", true).maybeSingle(),
  ]);

  if (!local?.lead_id) return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
  if (!asesor) return NextResponse.json({ error: "El asesor no está activo." }, { status: 422 });

  const { error } = await supabase
    .from("leads")
    .update({ asesor_id: destino })
    .eq("id", local.lead_id);

  if (error) {
    console.error("[avansa] No se pudo reasignar la conversación", { codigo: error.code });
    return NextResponse.json({ error: "No se pudo cambiar el asesor. Intenta de nuevo." }, { status: 400 });
  }
  return NextResponse.json({ asignadoA: destino });
}
