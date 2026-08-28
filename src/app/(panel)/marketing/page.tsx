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
import { resolverPeriodo, variacion } from "@/lib/periodo";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { ContenidoSocial } from "@/lib/supabase/tipos";
import { CabeceraMarketing, EstadoFuente, HeroPlataforma, MetricaPlataforma } from "./_componentes/Presentacion";
import { MarcaPlataforma } from "./_componentes/MarcaPlataforma";
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
  const contenidoMetaListo = Boolean(
    process.env.META_PAGE_ID
    && process.env.META_INSTAGRAM_ACCOUNT_ID
    && process.env.META_CONTENT_ACCESS_TOKEN,
  );
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
        apoyo="Una lectura ejecutiva de adquisición, tráfico, búsqueda y contenido. Cada cifra conserva su fuente para no mezclar eventos de plataforma con solicitudes del CRM."
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      <HeroPlataforma
        plataforma="avansa"
        ceja={`${rango.etiqueta} · panorama general`}
        titulo={<>De la inversión a una <span className="text-coral-100">solicitud real.</span></>}
        texto="El resumen cruza Meta Ads con los expedientes creados en Avansa y añade el contexto de Analytics, Search Console e Instagram."
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
          apoyo={cambioInversion === null ? "Sin base comparable" : `${Math.abs(cambioInversion).toFixed(1)} % frente al periodo anterior`}
          icono="monedas"
          color="#0866FF"
          destacado
        />
        <MetricaPlataforma
          rotulo="Solicitudes reales"
          valor={numero(leads.length)}
          apoyo="Expedientes creados en el CRM"
          icono="bandeja"
          color="#FF4D6D"
        />
        <MetricaPlataforma
          rotulo="Usuarios web"
          valor={google.analitica ? numero(google.analitica.usuarios) : "—"}
          apoyo={google.analitica ? `${numero(google.analitica.sesiones)} sesiones en GA4` : "Analytics sin datos disponibles"}
          icono="usuarios"
          color="#F9AB00"
        />
        <MetricaPlataforma
          rotulo="Clics orgánicos"
          valor={google.busqueda ? numero(google.busqueda.clics) : "—"}
          apoyo={google.busqueda ? `${numero(google.busqueda.impresiones)} impresiones en Google` : "Search Console sin datos disponibles"}
          icono="buscar"
          color="#4285F4"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Pulso de adquisición"
            apoyo="Inversión diaria de Meta; la gráfica secundaria cuenta solicitudes que sí llegaron al CRM."
            accion={<BotonEnlace href={`/marketing/meta?periodo=${rango.clave}`} tono="fantasma" tamano="sm">Abrir Meta Ads</BotonEnlace>}
          />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={series.gasto} color="#0866FF" formato="dinero" alto={230} /></div>
          <div className="mt-4 border-t border-hair pt-4">
            <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-slate">Solicitudes reales por día</p>
            <div className={estilos.grafica}><Linea serie={serieCrm} color="#FF4D6D" alto={150} /></div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Canales que traen sesiones" apoyo="Distribución reportada por GA4 para el periodo seleccionado." />
          <div className="mt-5">
            {canales.length > 0 ? (
              <BarrasHorizontales datos={canales} formato="numero" maximoFilas={5} />
            ) : (
              <EstadoFuente
                plataforma="analytics"
                titulo="Analytics todavía no respondió"
                texto={google.errorAnalitica ?? "Conecta Google para ver la mezcla real de canales."}
                estado={google.errorAnalitica ? "error" : "pendiente"}
                accion={google.configurado && !google.conectado ? <BotonEnlace href="/api/integraciones/google/conectar" tono="coral" tamano="sm">Conectar Google</BotonEnlace> : undefined}
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <EstadoFuente
          plataforma="meta"
          titulo="Meta Ads"
          texto={metaConfigurado() ? `${numero(total.clics)} clics y ${numero(total.alcance)} personas alcanzadas.` : "El panel está listo; falta el token técnico de lectura para sincronizar automáticamente."}
          estado={metaConfigurado() ? "conectado" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/meta?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver campañas</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="search"
          titulo="Search Console"
          texto={google.busqueda ? `CTR orgánico ${porcentaje(google.busqueda.ctr, 2)} y posición media ${google.busqueda.posicion?.toFixed(1) ?? "—"}.` : google.errorBusqueda ?? "Sin reporte orgánico todavía."}
          estado={google.busqueda ? "conectado" : google.errorBusqueda ? "error" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/search-console?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver búsqueda</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="instagram"
          titulo="Instagram"
          texto={`${numero(piezasInstagram.length)} piezas registradas; ${numero(publicacionesPendientes)} pendientes de salida.`}
          estado={contenidoMetaListo ? "conectado" : "pendiente"}
          accion={<BotonEnlace href={`/marketing/instagram?periodo=${rango.clave}`} tono="claro" tamano="sm">Ver contenido</BotonEnlace>}
        />
        <EstadoFuente
          plataforma="calendario"
          titulo="Calendario editorial"
          texto={`${numero(contenidos.length)} piezas guardadas entre Facebook e Instagram.`}
          estado="conectado"
          accion={<BotonEnlace href="/marketing/contenido" tono="claro" tamano="sm">Abrir calendario</BotonEnlace>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Atribución desde el CRM" apoyo="Origen declarado por los expedientes, no una estimación publicitaria." />
          <div className="mt-5">
            {atribucion.length > 0
              ? <BarrasHorizontales datos={atribucion} formato="numero" maximoFilas={6} />
              : <p className="py-8 text-center text-[0.8rem] text-slate">No entraron solicitudes en el periodo.</p>}
          </div>
        </Tarjeta>
        <Tarjeta className="overflow-hidden">
          <CabezaTarjeta titulo="Lectura rápida" apoyo="Tres señales para decidir qué revisar primero." />
          <div className="mt-4 space-y-2.5">
            <Senal plataforma="meta" titulo="Eficiencia de pauta" valor={cplReal === null ? "Sin solicitudes para calcular costo real" : `Cada solicitud real costó ${dineroCorto(cplReal)}`} />
            <Senal plataforma="analytics" titulo="Actividad del sitio" valor={google.analitica ? `${numero(google.analitica.usuarios)} usuarios generaron ${numero(google.analitica.vistas)} vistas` : "Analytics aún no devuelve información"} />
            <Senal plataforma="search" titulo="Demanda orgánica" valor={google.busqueda ? `${numero(google.busqueda.clics)} clics desde ${numero(google.busqueda.impresiones)} apariciones` : "Search Console aún no devuelve información"} />
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

function Senal({
  plataforma,
  titulo,
  valor,
}: {
  plataforma: "meta" | "analytics" | "search";
  titulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-mist p-3.5 transition hover:bg-white hover:shadow-tarjeta">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white shadow-tarjeta"><MarcaPlataforma plataforma={plataforma} className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-[0.78rem] font-semibold text-ink">{titulo}</p>
        <p className="mt-0.5 text-[0.73rem] leading-snug text-slate">{valor}</p>
      </div>
    </div>
  );
}
