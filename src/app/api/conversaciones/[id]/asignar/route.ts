import { NextResponse } from "next/server";
import { puedeVer } from "@/lib/bandeja";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerSesion } from "@/lib/supabase/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repartir una conversación.
 *
 * Quién puede hacer qué no se decide aquí: se intenta el `update` y la RLS
 * responde. Un asesor sólo puede tomar lo que está libre o soltar lo suyo;
 * un admin puede dárselo a cualquiera. Duplicar esa regla en TypeScript sería
 * crear una segunda versión de la verdad que algún día se desviaría.
 *
 * Cuerpo: `{ "a": "<uuid del perfil>" }` para asignar, `{ "a": null }` para
 * soltar.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const { id } = await ctx.params;
  const conversacion = Number(id);
  if (!Number.isInteger(conversacion) || conversacion <= 0) {
    return NextResponse.json({ error: "Conversación inválida" }, { status: 400 });
  }
  if (!(await puedeVer(conversacion))) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }

  let cuerpo: { a?: unknown };
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const destino =
    cuerpo.a === null || cuerpo.a === undefined ? null : String(cuerpo.a);

  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("conversaciones")
    .update({
      asignado_a: destino,
      asignado_en: destino ? new Date().toISOString() : null,
      asignado_por: destino ? sesion.usuarioId : null,
    })
    .eq("id", conversacion)
    .select("id, asignado_a");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Sin error pero sin filas: la RLS dejó pasar la consulta y bloqueó la
  // escritura. Es el caso de querer quitarle una conversación a otro.
  if (!data?.length) {
    return NextResponse.json(
      { error: "Esa conversación ya la está atendiendo alguien más." },
      { status: 409 },
    );
  }

  return NextResponse.json({ asignadoA: data[0].asignado_a });
}
