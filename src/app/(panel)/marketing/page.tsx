import type { Metadata } from "next";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { Linea } from "@/components/graficas/Linea";
import { BotonEnlace } from "@/components/ui/Boton";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { campanas, leadsCreados, metricasEnRango, totalizarPauta } from "@/lib/datos";
import { dineroCorto, numero, porcentaje } from "@/lib/formato";
import { resumenGoogle } from "@/lib/google/insights";
import { metaConfigurado } from "@/lib/meta/insights";
import { estadoConfiguracionPublicacion, verificarActivosPublicacion } from "@/lib/meta/publicador";
import { resolverPeriodo, variacion } from "@/lib/periodo";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { ContenidoSocial } from "@/lib/supabase/tipos";
import { CabeceraMarketing, EstadoFuente, HeroPlataforma, MetricaPlataforma } from "./_componentes/Presentacion";
import { atribucionLeads, serieLeadsCrm, seriesPauta } from "./_lib/metricas";
import estilos from "./marketing.module.css";

export const metadata: Metadata = { title: "Marketing · Resumen" };
export const dynamic = "force-dynamic";

export default async function ResumenMarketing({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const supabase = await clienteServidor();

  const [metricas, previas, leads, listaCampanas, google, contenidosRespuesta] = await Promise.all([
    metricasEnRango(rango.desde, rango.hasta),
    metricasEnRango(rango.anterior.desde, rango.anterior.hasta),
    leadsCreados(rango.desde, rango.hasta),
    campanas(),
    resumenGoogle(rango.desde, rango.hasta),
    supabase.from("contenidos_sociales").select("id, estado, tipo, plataformas"),
  ]);

  const total = totalizarPauta(metricas);
  const anterior = totalizarPauta(previas);
  const cplReal = leads.length > 0 ? total.gasto / leads.length : null;
  const series = seriesPauta(metricas, rango);
  const serieCrm = serieLeadsCrm(leads, rango);
  const atribucion = atribucionLeads(leads, listaCampanas);
  const contenidos = (contenidosRespuesta.data ?? []) as Pick<ContenidoSocial, "id" | "estado" | "tipo" | "plataformas">[];
  const piezasInstagram = contenidos.filter((pieza) => pieza.plataformas.includes("instagram"));
  const publicacionesPendientes = piezasInstagram.filter((pieza) => ["borrador", "programado"].includes(pieza.estado)).length;
  const configuracionContenido = estadoConfiguracionPublicacion();
  const validacionContenido = configuracionContenido.lista
    ? await verificarActivosPublicacion(["facebook", "instagram"])
    : { ok: false as const };
  const contenidoMetaListo = validacionContenido.ok;
  const canales = (google.analitica?.canales ?? []).map((canal, indice) => ({
    etiqueta: canal.nombre,
    valor: canal.sesiones,
    color: ["#FF4D6D", "#2FB6A3", "#0F2D3D", "#D9AE83", "#6B7785"][indice] ?? "#6B7785",
    nota: `${numero(canal.usuarios)} usu.`,
  }));
  const cambioInversion = variacion(total.gasto, anterior.gasto);

  return (
    <>
      <CabeceraMarketing
        titulo="Resumen de marketing"
        apoyo="Adquisición, tráfico, búsqueda y contenido con su fuente visible."
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      <HeroPlataforma
        plataforma="avansa"
        ceja={`${rango.etiqueta} · panorama general`}
        titulo={<>De la inversión a una <span className="text-coral-100">solicitud real.</span></>}
        texto="Cruza pauta, tráfico y expedientes creados en Avansa."
        cifras={[
          { etiqueta: "Inversión", valor: dineroCorto(total.gasto) },
          { etiqueta: "Solicitudes CRM", valor: numero(leads.length) },
          { etiqueta: "Costo real", valor: cplReal === null ? "—" : dineroCorto(cplReal) },
        ]}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricaPlataforma
          rotulo="Inversión Meta"
          valor={dineroCorto(total.gasto)}
          apoyo={cambioInversion === null ? "Sin comparativo" : `${Math.abs(cambioInversion).toFixed(1)} % vs. periodo anterior`}
          icono="monedas"
          color="#0866FF"
          destacado
        />
        <MetricaPlataforma
          rotulo="Solicitudes reales"
          valor={numero(leads.length)}
          apoyo="Expedientes en CRM"
          icono="bandeja"
          color="#FF4D6D"
        />
        <MetricaPlataforma
          rotulo="Usuarios web"
          valor={google.analitica ? numero(google.analitica.usuarios) : "—"}
          apoyo={google.analitica ? `${numero(google.analitica.sesiones)} visitas al sitio` : "Sitio web sin datos"}
          icono="usuarios"
          color="#F9AB00"
        />
        <MetricaPlataforma
          rotulo="Clics orgánicos"
          valor={google.busqueda ? numero(google.busqueda.clics) : "—"}
          apoyo={google.busqueda ? `${numero(google.busqueda.impresiones)} impresiones` : "SEO sin datos"}
          icono="buscar"
          color="#4285F4"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Pulso de adquisición"
            apoyo="Inversión diaria y solicitudes registradas."
            accion={<BotonEnlace href={`/marketing/meta?periodo=${rango.clave}`} tono="fantasma" tamano="sm">Abrir publicidad</BotonEnlace>}
          />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={series.gasto} color="#0866FF" formato="dinero" alto={230} /></div>
          <div className="mt-4 rounded-2xl bg-mist p-4">
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-slate">Solicitudes por día</p>
            <div className={estilos.grafica}><Linea serie={serieCrm} color="#FF4D6D" alto={150} /></div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Cómo llegan al sitio" apoyo="Distribución de las visitas medidas." />
          <div className="mt-5">
            {canales.length > 0 ? (
              <BarrasHorizontales datos={canales} formato="numero" maximoFilas={5} />
            ) : (
              <EstadoFuente
                plataforma="sitio"
                titulo={google.analitica ? "Sin fuentes en el periodo" : "El sitio todavía no tiene datos"}
                texto={google.analitica
                  ? google.analitica.canalesDisponibles
                    ? "No hubo visitas clasificadas en el periodo."
                    : "No pudimos leer el detalle de fuentes ahora."
                  : google.errorAnalitica
                    ? "No pudimos leer la medición ahora."
                    : "Conecta Google para ver los canales."}
                estado={google.analitica?.canalesDisponibles ? "conectado" : google.errorAnalitica || google.analitica ? "error" : "pendiente"}
                accion={google.configuradoAnalitica && !google.conectado ? <BotonEnlace href="/api/integraciones/google/conectar" tono="coral" tamano="sm">Conectar Google</BotonEnlace> : undefined}
              />
            )}
          </div>
          {google.analitica ? (
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-mist p-3">
              <DatoBreve etiqueta="Activos ahora" valor={google.analitica.activosAhora === null ? "—" : numero(google.analitica.activosAhora)} />
              <DatoBreve etiqueta="Eventos clave" valor={numero(google.analitica.eventosClave)} />
            </div>
          ) : null}
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
        <EstadoFuente
          plataforma="meta"
          titulo="Publicidad"
          texto={metaConfigurado() ? `${numero(total.clics)} clics · ${numero(total.alcance)} de alcance.` : "Conexión de lectura pendiente."}
          estado={metaConfigurado() ? "conectado" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/meta?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver campañas</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="sitio"
          titulo="Sitio web"
          texto={google.analitica ? `${numero(google.analitica.sesiones)} visitas · ${numero(google.analitica.eventosClave)} acciones clave.` : "Medición pendiente."}
          estado={google.analitica ? "conectado" : google.errorAnalitica ? "error" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/sitio-web?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver sitio</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="search"
          titulo="SEO"
          texto={google.busqueda ? `CTR ${porcentaje(google.busqueda.ctr, 2)} · posición ${google.busqueda.posicion?.toFixed(1) ?? "—"}.` : google.errorBusqueda ? "No pudimos leer la búsqueda ahora." : "Sin reporte orgánico."}
          estado={google.busqueda ? "conectado" : google.errorBusqueda ? "error" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/search-console?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver búsqueda</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="instagram"
          titulo="Instagram"
          texto={`${numero(piezasInstagram.length)} piezas · ${numero(publicacionesPendientes)} pendientes.`}
          estado={contenidoMetaListo ? "conectado" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/instagram?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver contenido</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="calendario"
          titulo="Calendario editorial"
          texto={`${numero(contenidos.length)} piezas guardadas.`}
          estado="conectado"
          accion={<BotonEnlace href="/marketing/contenido" tono="claro" tamano="sm">Abrir calendario</BotonEnlace>}
        />
      </div>

      <div className="mt-4">
        <Tarjeta>
          <CabezaTarjeta titulo="Atribución CRM" apoyo="Origen declarado en cada expediente." />
          <div className="mt-5">
            {atribucion.length > 0
              ? <BarrasHorizontales datos={atribucion} formato="numero" maximoFilas={6} />
              : <p className="py-8 text-center text-[0.8rem] text-slate">Sin solicitudes en el periodo.</p>}
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
function DatoBreve({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-tarjeta">
      <p className="text-[0.67rem] font-semibold uppercase tracking-[0.08em] text-slate">{etiqueta}</p>
      <p className="cifra mt-1 text-[1.2rem] font-semibold text-ink">{valor}</p>
    </div>
  );
}
