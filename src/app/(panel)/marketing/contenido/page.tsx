import type { Metadata } from "next";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { ContenidoMedio, ContenidoSocial } from "@/lib/supabase/tipos";
import { numero } from "@/lib/formato";
import { CabeceraMarketing, HeroPlataforma } from "../_componentes/Presentacion";
import { FormularioContenido } from "./FormularioContenido";

export const metadata: Metadata = { title: "Calendario de contenido" };
export const dynamic = "force-dynamic";

const ESTADOS = {
  borrador: ["Borrador", "#6B7785"],
  programado: ["Programado", "#D9AE83"],
  publicando: ["Enviando", "#0F2D3D"],
  publicado: ["Publicado", "#2FB6A3"],
  error: ["Revisar", "#E63A58"],
} as const;

const TIPOS = { publicacion: "Publicación", historia: "Historia", reel: "Reel" } as const;

export default async function CalendarioContenido() {
  await exigirRol("admin");
  const supabase = await clienteServidor();
  const [{ data: contenidos }, { data: medios }] = await Promise.all([
    supabase.from("contenidos_sociales").select("*").order("programado_para", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(36),
    supabase.from("contenido_medios").select("*").order("orden"),
  ]);

  const mediosPorContenido = new Map<string, (ContenidoMedio & { url: string | null })[]>();
  const mediosFirmados = await Promise.all(((medios ?? []) as ContenidoMedio[]).map(async (medio) => {
    const { data } = await supabase.storage.from("avansa-contenido").createSignedUrl(medio.storage_path, 60 * 60);
    return { ...medio, url: data?.signedUrl ?? null };
  }));
  for (const medio of mediosFirmados) {
    const lista = mediosPorContenido.get(medio.contenido_id) ?? [];
    lista.push(medio);
    mediosPorContenido.set(medio.contenido_id, lista);
  }
  const lista = (contenidos ?? []) as ContenidoSocial[];
  const pendientes = lista.filter((contenido) => ["borrador", "programado"].includes(contenido.estado)).length;
  const publicados = lista.filter((contenido) => contenido.estado === "publicado").length;

  return (
    <>
      <CabeceraMarketing
        titulo="Calendario de contenido"
        apoyo="Prepara piezas, conserva los archivos privados y deja listo el orden de publicación para Facebook e Instagram."
      />

      <HeroPlataforma
        plataforma="calendario"
        ceja="Centro editorial · Facebook + Instagram"
        titulo={<>Una sola cola para pasar de la <span className="text-coral-100">idea a la publicación.</span></>}
        texto="Cada pieza conserva copy, formato, plataformas, archivos privados y fecha. Publicar en Meta se habilita únicamente cuando la app tenga los permisos oficiales."
        cifras={[
          { etiqueta: "Piezas guardadas", valor: numero(lista.length) },
          { etiqueta: "Pendientes", valor: numero(pendientes) },
          { etiqueta: "Publicadas", valor: numero(publicados) },
        ]}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.8fr)]">
        <Tarjeta>
          <CabezaTarjeta titulo="Próximas piezas" apoyo="La cola editorial de Avansa, con hora de México cuando aplique." />
          {lista.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-mist px-5 py-10 text-center">
              <Icono nombre="calendario" className="mx-auto size-7 text-slate" />
              <p className="mt-3 text-[0.86rem] font-semibold text-ink">El calendario está libre</p>
              <p className="mt-1 text-[0.78rem] text-slate">Crea la primera pieza desde el formulario de la derecha.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {lista.map((contenido) => {
                const mediosDePieza = mediosPorContenido.get(contenido.id) ?? [];
                const primero = mediosDePieza[0];
                const [etiqueta, color] = ESTADOS[contenido.estado];
                return (
                  <article key={contenido.id} className="group overflow-hidden rounded-2xl bg-mist ring-1 ring-hair transition duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-elevada">
                    <div className="relative grid aspect-[16/8] place-items-center overflow-hidden bg-deep">
                      {primero?.url && primero.tipo_archivo === "imagen" ? (
                        // El archivo viene del bucket privado mediante una URL de una hora.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={primero.url} alt="" className="size-full object-cover" />
                      ) : primero?.tipo_archivo === "video" ? (
                        <Icono nombre="destello" className="size-7 text-white/80" />
                      ) : <Icono nombre="carpeta" className="size-7 text-white/60" />}
                      <div className="absolute right-2 top-2"><Insignia color={color} solida>{etiqueta}</Insignia></div>
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-[0.86rem] font-semibold text-ink">{contenido.titulo}</p>
                      <p className="mt-1 text-[0.74rem] text-slate">
                        {TIPOS[contenido.tipo]} · {contenido.plataformas.join(" + ")}
                        {contenido.programado_para && ` · ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(contenido.programado_para))}`}
                      </p>
                      {contenido.texto && <p className="mt-2 line-clamp-2 text-[0.75rem] leading-relaxed text-slate">{contenido.texto}</p>}
                      {mediosDePieza.length > 1 && <p className="mt-2 text-[0.72rem] font-semibold text-slate">{mediosDePieza.length} archivos adjuntos</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-[0.72rem] leading-relaxed text-slate">
            Publicar automáticamente requiere la aprobación y activos de la app de Meta. Los borradores y las fechas sí quedan guardados desde ahora.
          </p>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Nueva pieza" apoyo="Primero elige el canal y el formato; el archivo visual es opcional para que también puedas preparar copy." />
          <div className="mt-4"><FormularioContenido /></div>
        </Tarjeta>
      </div>

    </>
  );
}
