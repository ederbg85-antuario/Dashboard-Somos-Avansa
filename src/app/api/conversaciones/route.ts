import { NextResponse } from "next/server";
import { cargarBandeja } from "@/lib/bandeja";
import { obtenerSesion } from "@/lib/supabase/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La bandeja de quien pregunta.
 *
 * Es la ruta que consulta la pantalla cada pocos segundos para refrescar.
 * Devuelve ya recortada: quien no es admin no recibe las conversaciones de
 * los demás, no es que la pantalla las esconda.
 */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

  const estado = await cargarBandeja(sesion);

  if (!estado.listo) {
    return NextResponse.json(
      { error: estado.motivo, detalle: "detalle" in estado ? estado.detalle : null },
      { status: estado.motivo === "sin-configurar" ? 503 : 502 },
    );
  }

  return NextResponse.json({
    filas: estado.filas,
    // Cuántas quedan fuera de su vista. Al admin le da el total real; a un
    // asesor le confirma que hay trabajo repartido sin enseñarle de quién.
    ocultas: estado.total - estado.filas.length,
    rol: sesion.perfil.rol,
    yo: sesion.usuarioId,
  });
}
