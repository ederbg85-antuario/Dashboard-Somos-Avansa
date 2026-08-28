import { procesarColaPublicacion } from "@/lib/meta/cola-publicacion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return Response.json(
      { ok: false, error: "La tarea programada no esta configurada." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json(
      { ok: false, error: "No autorizado." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const resumen = await procesarColaPublicacion();
    if (!resumen.configurada) {
      return Response.json(
        { ok: false, error: "La cola de publicaciones no esta configurada.", ...resumen },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { ok: true, ...resumen },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (causa) {
    const mensaje = causa instanceof Error ? causa.message : "La cola no pudo ejecutarse.";
    return Response.json(
      { ok: false, error: mensaje.slice(0, 500) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
