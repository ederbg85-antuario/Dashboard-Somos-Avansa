import type { Metadata } from "next";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { Dona } from "@/components/graficas/Dona";
import { BotonEnlace } from "@/components/ui/Boton";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { inicioDelDia, finDelDia, numero } from "@/lib/formato";
import { resolverPeriodo } from "@/lib/periodo";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { ContenidoSocial } from "@/lib/supabase/tipos";
import { CabeceraMarketing, EstadoFuente, HeroPlataforma, MetricaPlataforma } from "../_componentes/Presentacion";

export const metadata: Metadata = { title: "Instagram · Marketing" };
export const dynamic = "force-dynamic";

const ESTADOS = {
  borrador: { etiqueta: "Borrador", color: "#6B7785" },
  programado: { etiqueta: "Programado", color: "#D9AE83" },
  publicando: { etiqueta: "Enviando", color: "#0866FF" },
  publicado: { etiqueta: "Publicado", color: "#2FB6A3" },
  error: { etiqueta: "Revisar", color: "#E63A58" },
} as const;

const TIPOS = {
  publicacion: { etiqueta: "Publicaciones", singular: "Publicación", color: "#EE2A7B" },
  historia: { etiqueta: "Historias", singular: "Historia", color: "#F9A12B" },
  reel: { etiqueta: "Reels", singular: "Reel", color: "#6228D7" },
} as const;

export default async function Instagram({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const supabase = await clienteServidor();
  const [rangoRespuesta, colaRespuesta] = await Promise.all([
    supabase
      .from("contenidos_sociales")
      .select("*")
      .contains("plataformas", ["instagram"])
      .gte("created_at", inicioDelDia(rango.desde))
      .lte("created_at", finDelDia(rango.hasta))
      .order("created_at", { ascending: false }),
    supabase
      .from("contenidos_sociales")
      .select("*")
      .contains("plataformas", ["instagram"])
      .order("programado_para", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const piezas = (rangoRespuesta.data ?? []) as ContenidoSocial[];
  const cola = (colaRespuesta.data ?? []) as ContenidoSocial[];
  const porTipo = (Object.keys(TIPOS) as ContenidoSocial["tipo"][]).map((tipo) => ({
    etiqueta: TIPOS[tipo].etiqueta,
    valor: piezas.filter((pieza) => pieza.tipo === tipo).length,
    color: TIPOS[tipo].color,
  }));
  const porEstado = (Object.keys(ESTADOS) as ContenidoSocial["estado"][])
    .map((estado) => ({
      etiqueta: ESTADOS[estado].etiqueta,
      valor: piezas.filter((pieza) => pieza.estado === estado).length,
      color: ESTADOS[estado].color,
    }))
    .filter((estado) => estado.valor > 0);
  const publicados = piezas.filter((pieza) => pieza.estado === "publicado").length;
  const programados = piezas.filter((pieza) => pieza.estado === "programado").length;
  const reels = piezas.filter((pieza) => pieza.tipo === "reel").length;
  const historias = piezas.filter((pieza) => pieza.tipo === "historia").length;
  const credencialesContenido = Boolean(
    process.env.META_INSTAGRAM_ACCOUNT_ID
    && process.env.META_CONTENT_ACCESS_TOKEN,
  );

  return (
    <>
      <CabeceraMarketing
        titulo="Instagram"
        apoyo="Planeación editorial de Instagram con métricas internas verificables. El rendimiento orgánico aparecerá cuando Meta autorice Insights."
        acciones={<><SelectorPeriodo actual={rango.clave} /><BotonEnlace href="/marketing/contenido" tono="coral">Nueva pieza</BotonEnlace></>}
      />

      <HeroPlataforma
        plataforma="instagram"
        tono="instagram"
        ceja={`${rango.etiqueta} · @somos.avansa`}
        titulo={<>Contenido con intención, <span className="text-white/70">no sólo publicaciones.</span></>}
        texto="Esta vista cuenta piezas guardadas en el calendario de Avansa. Seguidores, alcance e interacciones quedan vacíos hasta tener permiso oficial de Instagram Insights."
        cifras={[
          { etiqueta: "Piezas creadas", valor: numero(piezas.length) },
          { etiqueta: "Programadas", valor: numero(programados) },
          { etiqueta: "Publicadas", valor: numero(publicados) },
        ]}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricaPlataforma rotulo="Piezas" valor={numero(piezas.length)} apoyo={`Creadas durante ${rango.etiqueta.toLowerCase()}`} icono="carpeta" color="#EE2A7B" destacado />
        <MetricaPlataforma rotulo="Reels" valor={numero(reels)} apoyo="Video vertical registrado" icono="destello" color="#6228D7" />
        <MetricaPlataforma rotulo="Historias" valor={numero(historias)} apoyo="Historias dentro del calendario" icono="ojo" color="#F9A12B" />
        <MetricaPlataforma rotulo="Alcance orgánico" valor="—" apoyo="Pendiente de Instagram Insights" icono="usuarios" color="#6B7785" />
      </div>

      <div className="mt-4">
        <EstadoFuente
          plataforma="instagram"
          titulo={credencialesContenido ? "Credenciales de contenido disponibles" : "Publicación oficial pendiente"}
          texto={credencialesContenido
            ? "El entorno ya reconoce la cuenta de Instagram de Avansa. La publicación automática sólo se habilita después de probar permisos y revisión de Meta."
            : "Faltan el identificador de la cuenta profesional y el token técnico de contenido. El calendario funciona sin exponer credenciales."}
          estado={credencialesContenido ? "conectado" : "pendiente"}
          accion={<BotonEnlace href="/marketing/contenido" tono="claro" tamano="sm">Abrir calendario</BotonEnlace>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Mezcla de formatos" apoyo="Qué se produjo durante el periodo seleccionado." />
          <div className="mt-5"><Dona datos={porTipo} formato="numero" titulo="Formatos de Instagram" subtitulo="piezas" /></div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Estado editorial" apoyo="Avance real de las piezas guardadas en Avansa." />
          <div className="mt-5"><BarrasHorizontales datos={porEstado} formato="numero" maximoFilas={5} /></div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4">
        <CabezaTarjeta
          titulo="Cola de Instagram"
          apoyo="Las piezas más recientes y próximas, independientemente del periodo del reporte."
          accion={<BotonEnlace href="/marketing/contenido" tono="fantasma" tamano="sm">Gestionar contenido</BotonEnlace>}
        />
        {cola.length === 0 ? (
          <div className="mt-4 rounded-2xl bg-mist px-5 py-10 text-center">
            <Icono nombre="calendario" className="mx-auto size-7 text-slate" />
            <p className="mt-3 text-[0.86rem] font-semibold text-ink">No hay piezas para Instagram</p>
            <p className="mt-1 text-[0.78rem] text-slate">Crea la primera desde el calendario editorial.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {cola.map((pieza) => {
              const estado = ESTADOS[pieza.estado];
              const tipo = TIPOS[pieza.tipo];
              return (
                <article key={pieza.id} className="group relative overflow-hidden rounded-2xl bg-mist p-4 ring-1 ring-hair transition duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-elevada">
                  <span className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${tipo.color}, ${estado.color})` }} aria-hidden="true" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="grid size-9 place-items-center rounded-xl bg-white shadow-tarjeta"><Icono nombre={pieza.tipo === "reel" ? "destello" : pieza.tipo === "historia" ? "ojo" : "nota"} className="size-4" /></span>
                    <Insignia color={estado.color}>{estado.etiqueta}</Insignia>
                  </div>
                  <h3 className="mt-4 line-clamp-2 text-[0.84rem] font-semibold leading-snug text-ink">{pieza.titulo}</h3>
                  <p className="mt-1.5 text-[0.72rem] text-slate">{tipo.singular}</p>
                  <p className="mt-4 text-[0.7rem] font-medium text-slate">
                    {pieza.programado_para ? formatearFecha(pieza.programado_para) : "Sin fecha programada"}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <p className="mt-4 rounded-2xl bg-sand-50 px-4 py-3 text-[0.74rem] leading-relaxed text-slate">
        Instagram no expone métricas de perfiles profesionales sin permisos específicos y revisión de la app. Por eso seguidores, alcance e interacciones no se sustituyen con datos del calendario.
      </p>
    </>
  );
}

function formatearFecha(valor: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  }).format(new Date(valor));
}
