import type { Metadata } from "next";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { Linea } from "@/components/graficas/Linea";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Vacio } from "@/components/ui/Vacio";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { ESTADOS_CAMPANA } from "@/lib/constantes";
import { campanas as cargarCampanas, leadsCreados, metricasEnRango, totalizarPauta } from "@/lib/datos";
import { dinero, dineroCorto, numero, porcentaje } from "@/lib/formato";
import { metaConfigurado } from "@/lib/meta/insights";
import { resolverPeriodo, variacion } from "@/lib/periodo";
import { exigirRol } from "@/lib/supabase/sesion";
import { CabeceraMarketing, HeroPlataforma, MetricaPlataforma } from "../_componentes/Presentacion";
import { atribucionLeads, consolidarCampanas, seriesPauta } from "../_lib/metricas";
import { BotonSincronizar, CapturaMetrica, NuevaCampana } from "../Formularios";
import { PlanCampanas } from "./PlanCampanas";
import estilos from "../marketing.module.css";

export const metadata: Metadata = { title: "Publicidad · Marketing" };
export const dynamic = "force-dynamic";

export default async function MetaAds({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const [metricas, previas, listaCampanas, leads] = await Promise.all([
    metricasEnRango(rango.desde, rango.hasta),
    metricasEnRango(rango.anterior.desde, rango.anterior.hasta),
    cargarCampanas(),
    leadsCreados(rango.desde, rango.hasta),
  ]);

  const total = totalizarPauta(metricas);
  const anterior = totalizarPauta(previas);
  const filas = consolidarCampanas(metricas);
  const series = seriesPauta(metricas, rango);
  const atribucion = atribucionLeads(leads, listaCampanas);
  const cplReal = leads.length > 0 ? total.gasto / leads.length : null;
  const ranking = filas.map((campana) => ({
    etiqueta: campana.nombre,
    valor: campana.gasto,
    color: campana.estado === "activa" ? "#0866FF" : "#6B7785",
    nota: `${numero(campana.leads)} solicitudes`,
  }));
  const mejor = filas.find((fila) => fila.leads > 0);

  return (
    <>
      <CabeceraMarketing
        titulo="Publicidad"
        apoyo="Rendimiento de campañas en Meta, contrastado con las solicitudes que realmente entraron a Avansa."
        acciones={<><SelectorPeriodo actual={rango.clave} /><NuevaCampana /></>}
      />

      <HeroPlataforma
        plataforma="meta"
        tono="meta"
        ceja={`${rango.etiqueta} · cuenta publicitaria Avansa`}
        titulo={<>Pauta visible, del <span className="text-white/70">alcance al expediente.</span></>}
        texto={metaConfigurado()
          ? "La conexión de lectura está disponible. Meta puede ajustar la atribución durante los días posteriores a un resultado."
          : "La conexión de lectura está pendiente; mientras tanto sólo aparecen datos guardados en Avansa."}
        cifras={[
          { etiqueta: "Inversión", valor: dineroCorto(total.gasto) },
          { etiqueta: "Alcance", valor: numero(total.alcance) },
          { etiqueta: "Solicitudes CRM", valor: numero(leads.length) },
        ]}
      />

      <PlanCampanas
        campanasRegistradas={listaCampanas.length}
        campanasEnMeta={listaCampanas.filter((campana) => Boolean(campana.meta_campaign_id)).length}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricaPlataforma rotulo="Impresiones" valor={numero(total.impresiones)} apoyo={`${variacion(total.impresiones, anterior.impresiones)?.toFixed(1) ?? "—"} % vs. periodo anterior`} icono="ojo" color="#0866FF" />
        <MetricaPlataforma rotulo="Clics" valor={numero(total.clics)} apoyo={`CTR ${porcentaje(total.ctr, 2)}`} icono="enlace" color="#1877F2" destacado />
        <MetricaPlataforma rotulo="Resultados reportados" valor={numero(total.leads)} apoyo={`Costo reportado ${total.cpl === null ? "—" : dineroCorto(total.cpl)}`} icono="usuarios" color="#2FB6A3" />
        <MetricaPlataforma rotulo="Costo real" valor={cplReal === null ? "—" : dineroCorto(cplReal)} apoyo={`${numero(leads.length)} solicitudes creadas en Avansa`} icono="bandeja" color="#FF4D6D" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Inversión diaria" apoyo="Suma de campañas para cada día del periodo." />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={series.gasto} color="#0866FF" formato="dinero" alto={230} /></div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Respuesta a la pauta" apoyo="Clics diarios. La escala comienza en cero para no exagerar variaciones." />
          <div className={`${estilos.grafica} mt-5`}><Linea serie={series.clics} color="#2FB6A3" alto={230} /></div>
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <Tarjeta>
          <CabezaTarjeta titulo="Inversión por campaña" apoyo={mejor ? `La primera campaña con resultados reportados es “${mejor.nombre}”.` : "El ranking aparecerá cuando existan métricas."} />
          <div className="mt-5"><BarrasHorizontales datos={ranking} formato="dinero" maximoFilas={7} /></div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Origen de solicitudes" apoyo="Conteo de Avansa por campaña u origen, independiente del reporte publicitario." />
          <div className="mt-5"><BarrasHorizontales datos={atribucion} formato="numero" maximoFilas={7} /></div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4">
        <CabezaTarjeta titulo="Desempeño por campaña" apoyo={`Consolidado de ${rango.etiqueta.toLowerCase()}.`} />
        {filas.length === 0 ? (
          <Vacio icono="megafono" titulo="Sin datos en el periodo" texto="Actualiza la lectura o captura un día para comenzar a comparar campañas." />
        ) : (
          <Tabla className="mt-3">
            <Encabezados>
              <Th>Campaña</Th><Th>Estado</Th><Th numerica>Impresiones</Th><Th numerica>Clics</Th>
              <Th numerica>CTR</Th><Th numerica>CPC</Th><Th numerica>Gasto</Th><Th numerica>Leads</Th><Th numerica>CPL</Th>
            </Encabezados>
            <tbody>
              {filas.map((campana) => {
                const ctr = campana.impresiones > 0 ? (campana.clics * 100) / campana.impresiones : null;
                const cpc = campana.clics > 0 ? campana.gasto / campana.clics : null;
                const cpl = campana.leads > 0 ? campana.gasto / campana.leads : null;
                const estado = ESTADOS_CAMPANA[campana.estado];
                return (
                  <Fila key={campana.id}>
                    <Td><span className="font-semibold text-ink">{campana.nombre}</span></Td>
                    <Td><Insignia color={estado.color}>{estado.nombre}</Insignia></Td>
                    <Td numerica>{numero(campana.impresiones)}</Td>
                    <Td numerica>{numero(campana.clics)}</Td>
                    <Td numerica>{porcentaje(ctr, 2)}</Td>
                    <Td numerica>{cpc === null ? "—" : dinero(cpc)}</Td>
                    <Td numerica><span className="font-semibold">{dinero(campana.gasto)}</span></Td>
                    <Td numerica>{numero(campana.leads)}</Td>
                    <Td numerica>{cpl === null ? "—" : dinero(cpl)}</Td>
                  </Fila>
                );
              })}
              <Fila className="!border-t-2 !border-hair-fuerte font-semibold">
                <Td>Total</Td><Td /><Td numerica>{numero(total.impresiones)}</Td><Td numerica>{numero(total.clics)}</Td>
                <Td numerica>{porcentaje(total.ctr, 2)}</Td><Td numerica>{total.cpc === null ? "—" : dinero(total.cpc)}</Td>
                <Td numerica>{dinero(total.gasto)}</Td><Td numerica>{numero(total.leads)}</Td><Td numerica>{total.cpl === null ? "—" : dinero(total.cpl)}</Td>
              </Fila>
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Lectura de publicidad" apoyo="Importa impresiones, alcance, clics, gasto y resultados por campaña y día." />
          <div className="mt-4">
            <BotonSincronizar configurado={metaConfigurado()} />
            {!metaConfigurado() ? (
              <div className="mt-3 rounded-2xl bg-sand-50 p-4 text-[0.78rem] leading-relaxed text-ink">
                <p className="flex items-center gap-2 font-semibold"><Icono nombre="alerta" className="size-4" />Conexión de lectura pendiente</p>
                <p className="mt-1.5">Hasta completarla, el panel conserva la captura manual y no presenta cifras externas como si fueran actuales.</p>
              </div>
            ) : null}
          </div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Captura manual" apoyo="Guardar de nuevo la misma campaña y fecha corrige el registro; no lo duplica." />
          <div className="mt-4"><CapturaMetrica campanas={listaCampanas} /></div>
        </Tarjeta>
      </div>
    </>
  );
}
