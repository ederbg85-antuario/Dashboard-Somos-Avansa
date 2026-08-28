import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { BotonEnlace } from "@/components/ui/Boton";
import { Vacio } from "@/components/ui/Vacio";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Linea, type PuntoSerie } from "@/components/graficas/Linea";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { ESTADOS_CAMPANA } from "@/lib/constantes";
import { dinero, dineroCorto, fecha, numero, porcentaje } from "@/lib/formato";
import { diasDelRango, resolverPeriodo, variacion } from "@/lib/periodo";
import { campanas as cargarCampanas, leadsCreados, metricasEnRango, totalizarPauta } from "@/lib/datos";
import { metaConfigurado } from "@/lib/meta/insights";
import { resumenGoogle } from "@/lib/google/insights";
import { exigirRol } from "@/lib/supabase/sesion";
import { BotonSincronizar, CapturaMetrica, NuevaCampana } from "./Formularios";

export const metadata: Metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

export default async function Marketing({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { perfil } = await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const puedeEditar = perfil.rol === "admin";

  const [metricas, previas, campanas, leads, google] = await Promise.all([
    metricasEnRango(rango.desde, rango.hasta),
    metricasEnRango(rango.anterior.desde, rango.anterior.hasta),
    cargarCampanas(),
    leadsCreados(rango.desde, rango.hasta),
    resumenGoogle(rango.desde, rango.hasta),
  ]);

  const total = totalizarPauta(metricas);
  const previo = totalizarPauta(previas);

  // El costo por lead que importa es contra los expedientes que de verdad
  // entraron al CRM, no contra lo que reporta Meta: uno se puede auditar.
  const cplReal = leads.length > 0 ? total.gasto / leads.length : null;

  // Series diarias sin huecos.
  const gastoPorDia = new Map<string, number>();
  const leadsPorDia = new Map<string, number>();
  for (const m of metricas) {
    gastoPorDia.set(m.fecha, (gastoPorDia.get(m.fecha) ?? 0) + Number(m.gasto));
    leadsPorDia.set(m.fecha, (leadsPorDia.get(m.fecha) ?? 0) + Number(m.leads));
  }
  const dias = diasDelRango(rango.desde, rango.hasta);
  const serieGasto: PuntoSerie[] = dias.map((d) => ({ etiqueta: fecha(d), valor: gastoPorDia.get(d) ?? 0 }));
  const serieLeads: PuntoSerie[] = dias.map((d) => ({ etiqueta: fecha(d), valor: leadsPorDia.get(d) ?? 0 }));

  // Consolidado por campaña dentro del periodo.
  const porCampana = new Map<string, {
    id: string; nombre: string; estado: string;
    impresiones: number; clics: number; gasto: number; leads: number; conversaciones: number; alcance: number;
  }>();

  for (const m of metricas) {
    const id = m.campana?.id ?? m.campana_id;
    const fila = porCampana.get(id) ?? {
      id,
      nombre: m.campana?.nombre ?? "Campaña",
      estado: m.campana?.estado ?? "activa",
      impresiones: 0, clics: 0, gasto: 0, leads: 0, conversaciones: 0, alcance: 0,
    };
    fila.impresiones += Number(m.impresiones);
    fila.alcance += Number(m.alcance);
    fila.clics += Number(m.clics);
    fila.gasto += Number(m.gasto);
    fila.leads += Number(m.leads);
    fila.conversaciones += Number(m.conversaciones);
    porCampana.set(id, fila);
  }

  const filas = [...porCampana.values()].sort((a, b) => b.gasto - a.gasto);

  // De dónde vinieron los expedientes reales del periodo.
  const porOrigen = new Map<string, number>();
  for (const l of leads) {
    const clave = l.campana_id
      ? campanas.find((c) => c.id === l.campana_id)?.nombre ?? "Campaña"
      : l.origen ?? "sin origen";
    porOrigen.set(clave, (porOrigen.get(clave) ?? 0) + 1);
  }
  const atribucion = [...porOrigen.entries()]
    .map(([etiqueta, valor]) => ({ etiqueta, valor, color: "#0F2D3D" }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <>
      <Encabezado
        titulo="Marketing"
        apoyo="Campañas, tráfico web y búsqueda orgánica en un solo lugar. Los datos de Google se consultan sólo en los activos de avansa."
        acciones={
          <>
            <SelectorPeriodo actual={rango.clave} />
            <BotonEnlace href="/marketing/contenido" tono="claro" tamano="md">
              <Icono nombre="calendario" className="size-4" />Calendario
            </BotonEnlace>
            {puedeEditar && <NuevaCampana />}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Inversión" valor={dineroCorto(total.gasto)} icono="monedas" acento="#E63A58" invertido
          variacion={variacion(total.gasto, previo.gasto)}
          apoyo={`${numero(dias.length)} días`}
        />
        <Indicador
          rotulo="Costo por solicitud" valor={cplReal !== null ? dineroCorto(cplReal) : "—"}
          icono="bandeja" acento="#FF4D6D" invertido
          apoyo={`${numero(leads.length)} expedientes reales`}
        />
        <Indicador
          rotulo="Clics" valor={numero(total.clics)} icono="enlace" acento="#0F2D3D"
          variacion={variacion(total.clics, previo.clics)}
          apoyo={`CTR ${porcentaje(total.ctr, 2)}`}
        />
        <Indicador
          rotulo="Alcance" valor={numero(total.alcance)} icono="megafono" acento="#2FB6A3"
          variacion={variacion(total.alcance, previo.alcance)}
          apoyo={`CPM ${total.cpm !== null ? dineroCorto(total.cpm) : "—"}`}
        />
      </div>

      <Tarjeta className="mt-4">
        <CabezaTarjeta
          titulo="Tráfico web y búsqueda"
          apoyo="GA4 refleja el periodo elegido; Search Console puede tardar unos días en consolidar. “Activos ahora” usa la ventana en tiempo real de Google."
          accion={
            google.configurado && !google.conectado
              ? <BotonEnlace href="/api/integraciones/google/conectar" tono="coral" tamano="sm">Conectar Google</BotonEnlace>
              : google.conectado
                ? <BotonEnlace href={`/marketing?periodo=${rango.clave}`} tono="claro" tamano="sm"><Icono nombre="destello" className="size-3.5" />Actualizar</BotonEnlace>
                : undefined
          }
        />
        {!google.configurado ? (
          <p className="mt-4 rounded-xl bg-sand-50 px-3.5 py-3 text-[0.78rem] leading-relaxed text-sand-700">
            Faltan las credenciales de Google en el entorno de producción. Cuando estén, este bloque mostrará únicamente GA4 AVANSA y Search Console de somosavansa.com.
          </p>
        ) : !google.conectado ? (
          <p className="mt-4 rounded-xl bg-mist px-3.5 py-3 text-[0.78rem] leading-relaxed text-slate">
            Autoriza la cuenta de Google que ya tiene acceso a AVANSA. El permiso solicitado es sólo lectura para Analytics y Search Console.
          </p>
        ) : google.error ? (
          <p role="alert" className="mt-4 rounded-xl bg-coral-50 px-3.5 py-3 text-[0.78rem] leading-relaxed text-coral-700">
            La conexión existe, pero Google no devolvió el reporte: {google.error}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <DatoGoogle rotulo="Usuarios" valor={numero(google.analitica?.usuarios ?? 0)} icono="usuarios" color="#0F2D3D" />
            <DatoGoogle rotulo="Sesiones" valor={numero(google.analitica?.sesiones ?? 0)} icono="enlace" color="#2FB6A3" />
            <DatoGoogle rotulo="Vistas" valor={numero(google.analitica?.vistas ?? 0)} icono="ojo" color="#6B7785" />
            <DatoGoogle rotulo="Activos ahora" valor={google.analitica?.activosAhora === null ? "—" : numero(google.analitica?.activosAhora ?? 0)} icono="destello" color="#E63A58" />
            <DatoGoogle rotulo="Clics orgánicos" valor={numero(google.busqueda?.clics ?? 0)} icono="buscar" color="#D9AE83" />
          </div>
        )}
        {google.conectado && !google.error && google.busqueda && google.busqueda.consultas.length > 0 && (
          <div className="mt-4 border-t border-hair pt-4">
            <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-slate">Consultas orgánicas destacadas</p>
            <div className="flex flex-wrap gap-2">
              {google.busqueda.consultas.slice(0, 5).map((consulta) => (
                <span key={consulta.texto} className="rounded-lg bg-mist px-2.5 py-1.5 text-[0.74rem] text-ink">
                  {consulta.texto} <span className="cifra text-slate">· {numero(consulta.clics)} clics</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Tarjeta>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Tarjeta>
          <CabezaTarjeta titulo="Inversión diaria" apoyo="Lo que se gastó cada día en todas las campañas." />
          <div className="mt-4"><Linea serie={serieGasto} color="#E63A58" formato="dinero" alto={200} /></div>
        </Tarjeta>
        <Tarjeta>
          <CabezaTarjeta titulo="Leads reportados por Meta"
                         apoyo="Ojo: Meta cuenta el evento; el CRM cuenta el expediente. Casi nunca coinciden y la cifra buena es la del CRM." />
          <div className="mt-4"><Linea serie={serieLeads} color="#FF4D6D" alto={200} /></div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4">
        <CabezaTarjeta
          titulo="Desempeño por campaña"
          apoyo={`Consolidado de ${rango.etiqueta.toLowerCase()}.`}
        />
        {filas.length === 0 ? (
          <Vacio
            icono="megafono"
            titulo="Sin métricas en el periodo"
            texto="Captura el desempeño diario de cada campaña, o conecta el token de Meta para que se sincronice solo."
          />
        ) : (
          <Tabla className="mt-3">
            <Encabezados>
              <Th>Campaña</Th>
              <Th>Estado</Th>
              <Th numerica>Impresiones</Th>
              <Th numerica>Clics</Th>
              <Th numerica>CTR</Th>
              <Th numerica>CPC</Th>
              <Th numerica>Gasto</Th>
              <Th numerica>Leads</Th>
              <Th numerica>CPL</Th>
            </Encabezados>
            <tbody>
              {filas.map((c) => {
                const ctr = c.impresiones > 0 ? (c.clics * 100) / c.impresiones : null;
                const cpc = c.clics > 0 ? c.gasto / c.clics : null;
                const cpl = c.leads > 0 ? c.gasto / c.leads : null;
                return (
                  <Fila key={c.id}>
                    <Td><span className="font-semibold text-ink">{c.nombre}</span></Td>
                    <Td>
                      <Insignia color={ESTADOS_CAMPANA[c.estado as "activa"].color}>
                        {ESTADOS_CAMPANA[c.estado as "activa"].nombre}
                      </Insignia>
                    </Td>
                    <Td numerica>{numero(c.impresiones)}</Td>
                    <Td numerica>{numero(c.clics)}</Td>
                    <Td numerica>{porcentaje(ctr, 2)}</Td>
                    <Td numerica>{cpc !== null ? dinero(cpc) : "—"}</Td>
                    <Td numerica><span className="font-semibold">{dinero(c.gasto)}</span></Td>
                    <Td numerica>{numero(c.leads)}</Td>
                    <Td numerica>
                      {cpl !== null ? (
                        <span className="font-semibold" style={{ color: cpl <= 300 ? "#1E9E8D" : cpl <= 500 ? "#C79A6E" : "#E63A58" }}>
                          {dinero(cpl)}
                        </span>
                      ) : "—"}
                    </Td>
                  </Fila>
                );
              })}
              <Fila className="!border-t-2 !border-hair-fuerte font-semibold">
                <Td>Total</Td>
                <Td />
                <Td numerica>{numero(total.impresiones)}</Td>
                <Td numerica>{numero(total.clics)}</Td>
                <Td numerica>{porcentaje(total.ctr, 2)}</Td>
                <Td numerica>{total.cpc !== null ? dinero(total.cpc) : "—"}</Td>
                <Td numerica>{dinero(total.gasto)}</Td>
                <Td numerica>{numero(total.leads)}</Td>
                <Td numerica>{total.cpl !== null ? dinero(total.cpl) : "—"}</Td>
              </Fila>
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="De dónde vinieron los expedientes"
            apoyo="Atribución real, contada desde el CRM y no desde la plataforma."
          />
          <div className="mt-4">
            {atribucion.length === 0
              ? <p className="py-8 text-center text-[0.8rem] text-slate">Sin expedientes en el periodo.</p>
              : <BarrasHorizontales datos={atribucion} formato="numero" maximoFilas={7} />}
          </div>
        </Tarjeta>

        {puedeEditar ? (
          <div className="space-y-4">
            <Tarjeta>
              <CabezaTarjeta
                titulo="Sincronizar con Meta"
                apoyo="Trae impresiones, clics, gasto y leads directo de la Marketing API, un renglón por campaña y día."
              />
              <div className="mt-4">
                <BotonSincronizar configurado={metaConfigurado()} />
                {!metaConfigurado() && (
                  <div className="mt-3 rounded-xl bg-sand-50 p-3.5 ring-1 ring-sand-100">
                    <p className="flex items-center gap-2 text-[0.8rem] font-semibold text-ink">
                      <Icono nombre="alerta" className="size-4 text-sand" />
                      Falta el acceso a Meta
                    </p>
                    <p className="mt-1.5 text-[0.78rem] leading-relaxed text-slate">
                      Define <code className="rounded bg-white px-1 py-0.5 text-[0.72rem]">META_ACCESS_TOKEN</code> y{" "}
                      <code className="rounded bg-white px-1 py-0.5 text-[0.72rem]">META_AD_ACCOUNT_ID</code> en el
                      entorno del despliegue. Mientras tanto, la captura manual de aquí abajo funciona igual.
                    </p>
                  </div>
                )}
              </div>
            </Tarjeta>

            <Tarjeta>
              <CabezaTarjeta
                titulo="Capturar un día a mano"
                apoyo="Reescribir el mismo día corrige el dato en vez de duplicarlo."
              />
              <div className="mt-4"><CapturaMetrica campanas={campanas} /></div>
            </Tarjeta>
          </div>
        ) : (
          <Tarjeta>
            <Vacio icono="candado" titulo="Sólo lectura"
                   texto="Las campañas y sus métricas las administran los roles de dirección y marketing." />
          </Tarjeta>
        )}
      </div>
    </>
  );
}

function DatoGoogle({ rotulo, valor, icono, color }: { rotulo: string; valor: string; icono: "usuarios" | "enlace" | "ojo" | "destello" | "buscar"; color: string }) {
  return (
    <div className="rounded-xl bg-mist p-3.5">
      <Icono nombre={icono} className="size-4" />
      <p className="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-slate">{rotulo}</p>
      <p className="cifra mt-1 text-[1.25rem] font-semibold" style={{ color }}>{valor}</p>
    </div>
  );
}
