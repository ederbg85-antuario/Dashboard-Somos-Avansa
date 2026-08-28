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
import estilos from "../marketing.module.css";

export const metadata: Metadata = { title: "Search Console · Marketing" };
export const dynamic = "force-dynamic";

export default async function SearchConsole({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const google = await resumenGoogle(rango.desde, rango.hasta);
  const busqueda = google.busqueda;
  const serieClics: PuntoSerie[] = (busqueda?.dias ?? []).map((dia) => ({ etiqueta: fecha(dia.fecha), valor: dia.clics }));
  const serieImpresiones: PuntoSerie[] = (busqueda?.dias ?? []).map((dia) => ({ etiqueta: fecha(dia.fecha), valor: dia.impresiones }));
  const consultas = busqueda?.consultas ?? [];
  const ranking = consultas.map((consulta, indice) => ({
    etiqueta: consulta.texto,
    valor: consulta.clics,
    color: ["#4285F4", "#2FB6A3", "#FF4D6D", "#D9AE83"][indice % 4],
    nota: `pos. ${consulta.posicion.toFixed(1)}`,
  }));

  return (
    <>
      <CabeceraMarketing
        titulo="Search Console"
        apoyo="Visibilidad orgánica de somosavansa.com: consultas, clics, impresiones y posición media directamente desde Google."
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      <HeroPlataforma
        plataforma="search"
        tono="search"
        ceja={`${rango.etiqueta} · somosavansa.com`}
        titulo={<>Lo que la gente <span className="text-white/70">ya está buscando.</span></>}
        texto="Search Console consolida información con retraso; por eso el reporte cierra en el último día disponible y no presenta el día actual como completo."
        cifras={[
          { etiqueta: "Clics orgánicos", valor: busqueda ? numero(busqueda.clics) : "—" },
          { etiqueta: "Impresiones", valor: busqueda ? numero(busqueda.impresiones) : "—" },
          { etiqueta: "CTR", valor: busqueda ? porcentaje(busqueda.ctr, 2) : "—" },
        ]}
      />

      {!google.configurado || !google.conectado || google.errorBusqueda ? (
        <div className="mt-4">
          <EstadoFuente
            plataforma="search"
            titulo={google.errorBusqueda ? "Search Console necesita revisión" : "Conecta la propiedad de Avansa"}
            texto={google.errorBusqueda ?? (google.configurado ? "Autoriza la cuenta Google con acceso de lectura a somosavansa.com." : "Faltan las credenciales del proyecto Google en producción.")}
            estado={google.errorBusqueda ? "error" : "pendiente"}
            accion={google.configurado && !google.conectado ? <BotonEnlace href="/api/integraciones/google/conectar" tono="coral" tamano="sm">Conectar Google</BotonEnlace> : undefined}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricaPlataforma rotulo="Clics" valor={busqueda ? numero(busqueda.clics) : "—"} apoyo="Visitas procedentes de resultados orgánicos" icono="enlace" color="#4285F4" destacado />
        <MetricaPlataforma rotulo="Impresiones" valor={busqueda ? numero(busqueda.impresiones) : "—"} apoyo="Apariciones en resultados de Google" icono="ojo" color="#5F9AF3" />
        <MetricaPlataforma rotulo="CTR orgánico" valor={busqueda ? porcentaje(busqueda.ctr, 2) : "—"} apoyo="Clics divididos entre impresiones" icono="destello" color="#2FB6A3" />
        <MetricaPlataforma rotulo="Posición media" valor={busqueda?.posicion === null || busqueda?.posicion === undefined ? "—" : busqueda.posicion.toFixed(1)} apoyo="Promedio ponderado reportado por Google" icono="reporte" color="#D9AE83" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Clics orgánicos por día" apoyo="Tráfico efectivo desde los resultados de búsqueda." />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={serieClics} color="#4285F4" alto={230} /></div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Impresiones por día" apoyo="Cuántas veces apareció Avansa en una página de resultados." />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={serieImpresiones} color="#2FB6A3" alto={230} /></div>
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[.82fr_1.18fr]">
        <Tarjeta>
          <CabezaTarjeta titulo="Consultas que generan clics" apoyo="Ordenadas por clics dentro del periodo." />
          <div className="mt-5">
            {ranking.length > 0
              ? <BarrasHorizontales datos={ranking} formato="numero" maximoFilas={10} />
              : <Vacio icono="buscar" titulo="Sin consultas disponibles" texto="Google todavía no reporta consultas para este periodo." />}
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="Detalle de consultas" apoyo="Las consultas pueden omitirse por los umbrales de privacidad de Google." />
          {consultas.length > 0 ? (
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Consulta</Th><Th numerica>Clics</Th><Th numerica>Impresiones</Th><Th numerica>CTR</Th><Th numerica>Posición</Th>
              </Encabezados>
              <tbody>
                {consultas.map((consulta) => {
                  const ctr = consulta.impresiones > 0 ? (consulta.clics * 100) / consulta.impresiones : null;
                  return (
                    <Fila key={consulta.texto}>
                      <Td><span className="font-semibold text-ink">{consulta.texto}</span></Td>
                      <Td numerica>{numero(consulta.clics)}</Td>
                      <Td numerica>{numero(consulta.impresiones)}</Td>
                      <Td numerica>{porcentaje(ctr, 2)}</Td>
                      <Td numerica>{consulta.posicion.toFixed(1)}</Td>
                    </Fila>
                  );
                })}
              </tbody>
            </Tabla>
          ) : (
            <Vacio icono="buscar" titulo="Sin detalle orgánico" texto="Amplía el periodo o espera a que Search Console consolide información." />
          )}
        </Tarjeta>
      </div>

      {google.analitica ? (
        <Tarjeta className="mt-4 bg-gradient-to-br from-white to-[#fff9ef]">
          <CabezaTarjeta titulo="Contexto en Analytics" apoyo="Después del clic, GA4 mide la navegación del sitio con una metodología distinta." />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Contexto etiqueta="Usuarios" valor={numero(google.analitica.usuarios)} />
            <Contexto etiqueta="Sesiones" valor={numero(google.analitica.sesiones)} />
            <Contexto etiqueta="Vistas" valor={numero(google.analitica.vistas)} />
          </div>
        </Tarjeta>
      ) : null}
    </>
  );
}

function Contexto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-tarjeta ring-1 ring-hair">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-slate">{etiqueta}</p>
      <p className="cifra mt-1.5 text-[1.55rem] font-semibold text-ink">{valor}</p>
    </div>
  );
}

