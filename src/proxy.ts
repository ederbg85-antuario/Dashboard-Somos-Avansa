import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresca la sesión en cada petición y cierra el panel a quien no entró.
 *
 * Es la primera línea, no la única: cada página privada vuelve a comprobar la
 * sesión contra la base con `exigirSesion()`. Aquí sólo se evita el parpadeo
 * de pintar una pantalla que después va a redirigir.
 */

/** Rutas que se sirven sin sesión. */
const PUBLICAS = ["/entrar", "/auth"];
const WEBHOOK_CHATWOOT = "/api/webhooks/chatwoot";

export async function proxy(peticion: NextRequest) {
  const { pathname } = peticion.nextUrl;
  let respuesta = NextResponse.next({ request: peticion });

  // Chatwoot no tiene una cookie de Supabase. Esta única ruta entra con su
  // secreto propio, validado en tiempo constante dentro del handler. No se
  // abre el resto de `/api/webhooks` ni ninguna otra API del panel.
  if (pathname === WEBHOOK_CHATWOOT) return respuesta;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin credenciales no hay a quién preguntarle: se deja pasar y la página
  // muestra el aviso de configuración pendiente en vez de un error opaco.
  if (!url || !clave) return respuesta;

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => peticion.cookies.getAll(),
      setAll(porEscribir) {
        porEscribir.forEach(({ name, value }) => peticion.cookies.set(name, value));
        respuesta = NextResponse.next({ request: peticion });
        porEscribir.forEach(({ name, value, options }) =>
          respuesta.cookies.set(name, value, options),
        );
      },
    },
  });

  // `getUser()` y no `getSession()`: valida el token contra Supabase en vez de
  // confiar en lo que traiga la cookie.
  const { data: { user } } = await supabase.auth.getUser();

  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !esPublica) {
    // A una llamada de datos se le contesta con un 401, no con la página de
    // entrar: quien la hizo es un `fetch`, y seguir la redirección le
    // devolvería el HTML del login con un 200. La bandeja se quedaría
    // refrescando en silencio contra una sesión que ya no existe, mostrando
    // mensajes viejos sin avisar de nada.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    }

    const destino = peticion.nextUrl.clone();
    destino.pathname = "/entrar";
    // Se recuerda a dónde iba para devolverlo ahí después de entrar.
    if (pathname !== "/") destino.searchParams.set("destino", pathname);
    return NextResponse.redirect(destino);
  }

  if (user && pathname === "/entrar") {
    const destino = peticion.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  matcher: [
    /* Todo menos archivos estáticos, imágenes y el favicon. */
    "/((?!_next/static|_next/image|favicon.ico|marca/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
