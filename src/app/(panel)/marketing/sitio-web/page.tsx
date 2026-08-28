import type { Metadata } from "next";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { Linea, type PuntoSerie } from "@/components/graficas/Linea";
import { BotonEnlace } from "@/components/ui/Boton";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { fecha, numero, porcentaje } from "@/lib/formato";
import { resumenGoogle } from "@/lib/google/insights";
import { resolverPeriodo } from "@/lib/periodo";
import { exigirRol } from "@/lib/supabase/sesion";
import { CabeceraMarketing, EstadoFuente, HeroPlataforma, MetricaPlataforma } from "../_componentes/Presentacion";
import { duracionBreve, nombreCanal, resultadosMedidos } from "../_lib/sitio";
import estilos from "../marketing.module.css";

export const metadata: Metadata = { title: "Sitio web · Marketing" };
export const dynamic = "force-dynamic";

const COLORES_GOOGLE = ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#7B61FF"];

export default async function SitioWeb({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const google = await resumenGoogle(rango.desde, rango.hasta);
  const sitio = google.analitica;
  const resultados = sitio ? resultadosMedidos(sitio) : null;

  const tendencia: PuntoSerie[] = (sitio?.dias ?? []).map((dia) => ({
    etiqueta: fecha(dia.fecha),
    valor: dia.sesiones,
  }));
  const canales = (sitio?.canales ?? []).map((canal, indice) => ({
    etiqueta: nombreCanal(canal.nombre),
    valor: canal.sesiones,
    color: COLORES_GOOGLE[indice % COLORES_GOOGLE.length],
    nota: `${numero(canal.usuarios)} pers.`,
  }));

  const estadoConexion = sitio ? "conectado" : google.errorAnalitica ? "error" : "pendiente";
  const textoConexion = sitio
    ? `Datos medidos para ${rango.etiqueta.toLowerCase()}.`
    : google.errorAnalitica
      ? "La lectura del sitio no está disponible ahora. Intenta de nuevo más tarde."
      : google.configuradoAnalitica
        ? "Falta autorizar la cuenta que tiene acceso a la medición del sitio."
        : "Falta completar la propiedad de medición del sitio en producción.";

  return (
    <>
      <CabeceraMarketing
        titulo="Sitio web"
        apoyo="Visitas, fuentes, páginas y acciones importantes de somosavansa.com."
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      <HeroPlataforma
        plataforma="sitio"
        tono="google"
        ceja={`${rango.etiqueta} · somosavansa.com`}
        titulo={<>Cada visita deja una <span className="text-[#4285F4]">señal útil.</span></>}
        texto="El panel sólo muestra acciones recibidas por la medición del sitio; lo que no esté conectado permanece vacío."
        cifras={[
          { etiqueta: "Visitas", valor: sitio ? numero(sitio.sesiones) : "—" },
          { etiqueta: "Personas", valor: sitio ? numero(sitio.usuarios) : "—" },
          { etiqueta: "Acciones clave", valor: sitio ? numero(sitio.eventosClave) : "—" },
        ]}
      />

      {!sitio ? (
        <div className="mt-4">
          <EstadoFuente
            plataforma="sitio"
            titulo="Medición del sitio"
            texto={textoConexion}
            estado={estadoConexion}
            accion={google.configuradoAnalitica && !google.conectado
              ? <BotonEnlace href="/api/integraciones/google/conectar" tono="coral" tamano="sm">Conectar Google</BotonEnlace>
              : undefined}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricaPlataforma
          rotulo="Visitas"
          valor={sitio ? numero(sitio.sesiones) : "—"}
          apoyo={sitio ? `${numero(sitio.usuarios)} personas` : "Sin lectura disponible"}
          icono="ojo"
          color="#4285F4"
          destacado
        />
        <MetricaPlataforma
          rotulo="Formularios"
          valor={resultados?.formularios === null || resultados?.formularios === undefined
            ? "—"
            : numero(resultados.formularios)}
          apoyo={resultados?.formularios === null
            ? "Detalle de formularios no disponible"
            : resultados
              ? "Envíos confirmados por el sitio"
              : "Sin lectura disponible"}
          icono="bandeja"
          color="#34A853"
        />
        <MetricaPlataforma
          rotulo="Clics a WhatsApp"
          valor={resultados?.clicsWhatsapp === null || resultados?.clicsWhatsapp === undefined
            ? "—"
            : numero(resultados.clicsWhatsapp)}
          apoyo={resultados?.clicsWhatsapp === null
            ? "Falta habilitar el desglose por canal"
            : resultados
              ? "Clics medidos en botones del sitio"
              : "Sin lectura disponible"}
          icono="whatsapp"
          color="#25D366"
        />
        <MetricaPlataforma
          rotulo="Acciones clave"
          valor={sitio ? numero(sitio.eventosClave) : "—"}
          apoyo={sitio ? "Marcadas como resultado importante" : "Sin lectura disponible"}
          icono="destello"
          color="#EA4335"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.8fr)]">
        <Tarjeta>
          <CabezaTarjeta titulo="Tendencia de visitas" apoyo="Sesiones por día, con escala desde cero." />
          <div className={`${estilos.grafica} mt-5`}>
            {sitio && !sitio.diasDisponibles
              ? <Vacio icono="reporte" titulo="Tendencia no disponible" texto="Las cifras generales siguen disponibles; intenta leer el detalle más tarde." />
              : <Linea serie={tendencia} color="#4285F4" alto={240} />}
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Comportamiento" apoyo="Señales de atención dentro del sitio." />
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <DatoComportamiento etiqueta="Interacción" valor={sitio ? porcentaje(sitio.tasaInteraccion, 1) : "—"} color="#34A853" />
            <DatoComportamiento etiqueta="Tiempo medio" valor={duracionBreve(sitio?.duracionMediaSegundos ?? null)} color="#4285F4" />
            <DatoComportamiento etiqueta="Vistas / visita" valor={sitio?.vistasPorSesion === null || sitio?.vistasPorSesion === undefined ? "—" : sitio.vistasPorSesion.toFixed(1)} color="#FBBC04" />
            <DatoComportamiento etiqueta="Vistas" valor={sitio ? numero(sitio.vistas) : "—"} color="#EA4335" />
          </dl>
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
        <Tarjeta>
          <CabezaTarjeta titulo="Cómo llegan" apoyo="Visitas por fuente principal." />
          <div className="mt-5">
            {canales.length > 0
              ? <BarrasHorizontales datos={canales} formato="numero" maximoFilas={7} />
              : <Vacio
                  icono="enlace"
                  titulo={sitio && !sitio.canalesDisponibles ? "Detalle no disponible" : "Sin fuentes disponibles"}
                  texto={sitio
                    ? sitio.canalesDisponibles
                      ? "No hubo visitas clasificadas en el periodo."
                      : "No pudimos leer las fuentes; las cifras generales siguen disponibles."
                    : "La medición del sitio aún no está conectada."}
                />}
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Páginas más vistas" apoyo="Contenido con actividad dentro del periodo." />
          {sitio?.paginas.length ? (
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Página</Th><Th numerica>Vistas</Th><Th numerica>Personas</Th>
              </Encabezados>
              <tbody>
                {sitio.paginas.map((pagina) => (
                  <Fila key={`${pagina.ruta}-${pagina.titulo}`}>
                    <Td>
                      <span className="block max-w-[30rem] truncate font-semibold text-ink" title={pagina.titulo}>{pagina.titulo}</span>
                      <span className="block max-w-[30rem] truncate text-[0.7rem] text-slate" title={pagina.ruta}>{pagina.ruta}</span>
                    </Td>
                    <Td numerica>{numero(pagina.vistas)}</Td>
                    <Td numerica>{numero(pagina.usuarios)}</Td>
                  </Fila>
                ))}
              </tbody>
            </Tabla>
          ) : (
            <Vacio
              icono="nota"
              titulo={sitio && !sitio.paginasDisponibles ? "Detalle no disponible" : "Sin páginas disponibles"}
              texto={sitio
                ? sitio.paginasDisponibles
                  ? "No hubo páginas vistas en el periodo."
                  : "No pudimos leer el detalle de páginas; las cifras generales siguen disponibles."
                : "La medición del sitio aún no está conectada."}
            />
          )}
        </Tarjeta>
      </div>
    </>
  );
}

function DatoComportamiento({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-mist p-4">
      <span className="block size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      <dt className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate">{etiqueta}</dt>
      <dd className="cifra mt-1 text-[1.35rem] font-semibold text-ink">{valor}</dd>
    </div>
  );
}
