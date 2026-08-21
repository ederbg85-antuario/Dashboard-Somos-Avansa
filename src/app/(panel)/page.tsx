import Link from "next/link";
import { Encabezado } from "@/components/panel/Encabezado";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { puede } from "@/components/panel/navegacion";
import { Avance, Indicador } from "@/components/ui/Indicador";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/Boton";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Linea, type PuntoSerie } from "@/components/graficas/Linea";
import { Barras } from "@/components/graficas/Barras";
import { BarrasHorizontales } from "@/components/graficas/Barras";
import { Embudo } from "@/components/graficas/Embudo";
import {
  contables, leadsCerrados, leadsCreados, metaDelMes,
  metricasEnRango, movimientosEnRango, pipelineCompleto, totalizarPauta,
} from "@/lib/datos";
import { calcular } from "@/lib/finanzas";
import { CLASIFICACIONES, ETAPA, embudoAcumulado } from "@/lib/constantes";
import { dinero, dineroCorto, fecha, haceCuanto, inicioDeMes, numero, porcentaje } from "@/lib/formato";
import { diasDelRango, resolverPeriodo, ultimosMeses, variacion } from "@/lib/periodo";
import { exigirSesion } from "@/lib/supabase/sesion";

export const dynamic = "force-dynamic";

export default async function Resumen({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { perfil } = await exigirSesion();
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const veFinanzas = puede(perfil.rol, "finanzas");

  // Una sola tanda de consultas en paralelo: el tablero no debe encadenar
  // esperas para pintar seis tarjetas.
  const [nuevos, previos, cerradosAhora, cerradosAntes, pipeline, pauta, pautaPrevia, meta] =
    await Promise.all([
      leadsCreados(rango.desde, rango.hasta),
      leadsCreados(rango.anterior.desde, rango.anterior.hasta),
      leadsCerrados(rango.desde, rango.hasta),
      leadsCerrados(rango.anterior.desde, rango.anterior.hasta),
      pipelineCompleto(),
      metricasEnRango(rango.desde, rango.hasta),
      metricasEnRango(rango.anterior.desde, rango.anterior.hasta),
      metaDelMes(inicioDeMes()),
    ]);

  const ganados = cerradosAhora.filter((l) => l.estado === "cerrado");
  const ganadosAntes = cerradosAntes.filter((l) => l.estado === "cerrado");

  const totalPauta = totalizarPauta(pauta);
  const totalPautaPrevia = totalizarPauta(pautaPrevia);

  // El costo por lead se calcula con los leads que de verdad entraron al
  // sistema, no con los que reporta Meta: es el número que se puede auditar.
  const cpl = nuevos.length > 0 ? totalPauta.gasto / nuevos.length : null;
  const cplPrevio = previos.length > 0 ? totalPautaPrevia.gasto / previos.length : null;

  const tasaCierre = nuevos.length > 0 ? (ganados.length * 100) / nuevos.length : null;

  // Serie diaria sin huecos: un día sin leads tiene que dibujarse como cero,
  // no desaparecer y falsear la pendiente.
  const porDia = new Map<string, number>();
  for (const l of nuevos) {
    const dia = l.created_at.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
  }
  const serieLeads: PuntoSerie[] = diasDelRango(rango.desde, rango.hasta).map((d) => ({
    etiqueta: fecha(d),
    valor: porDia.get(d) ?? 0,
  }));

  // Embudo acumulado —«llegó hasta aquí o más lejos»—, no el conteo por
  // columna: con el conteo por columna salen conversiones mayores al 100 %.
  const embudo = embudoAcumulado(pipeline).map((e) => ({
    etiqueta: e.nombre,
    total: e.total,
    color: e.color,
  }));

  const valorPipeline = pipeline
    .filter((l) => l.estado !== "cerrado" && l.estado !== "descartado")
    .reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);

  // Ranking de pauta por campaña dentro del periodo.
  const porCampana = new Map<string, { nombre: string; gasto: number; leads: number }>();
  for (const m of pauta) {
    const clave = m.campana?.id ?? m.campana_id;
    const actual = porCampana.get(clave) ?? { nombre: m.campana?.nombre ?? "Campaña", gasto: 0, leads: 0 };
    actual.gasto += Number(m.gasto);
    actual.leads += Number(m.leads);
    porCampana.set(clave, actual);
  }
  const ranking = [...porCampana.values()]
    .sort((a, b) => b.gasto - a.gasto)
    .map((c) => ({
      etiqueta: c.nombre,
      valor: c.gasto,
      color: "#FF4D6D",
      nota: c.leads > 0 ? `${dineroCorto(c.gasto / c.leads)}/lead` : "sin leads",
    }));

  const pendientes = pipeline
    .filter((l) => l.fecha_proxima_accion && l.estado !== "cerrado" && l.estado !== "descartado")
    .sort((a, b) => (a.fecha_proxima_accion! < b.fecha_proxima_accion! ? -1 : 1))
    .slice(0, 6);

  return (
    <>
      <Encabezado
        titulo={`Hola, ${perfil.nombre.split(" ")[0]}`}
        apoyo={`Así va el negocio en ${rango.etiqueta.toLowerCase()}. Todo lo que ves respeta tu rol: ${
          veFinanzas ? "tienes acceso completo, incluidas finanzas." : "el detalle financiero está reservado a dirección y finanzas."
        }`}
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      {/* ---------- cifras del periodo ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Solicitudes nuevas"
          valor={numero(nuevos.length)}
          icono="bandeja"
          acento="#FF4D6D"
          variacion={variacion(nuevos.length, previos.length)}
          apoyo={`vs. ${numero(previos.length)} antes`}
          extra={meta?.leads_meta ? <Avance logrado={nuevos.length} meta={meta.leads_meta} color="#FF4D6D" etiqueta="Meta del mes" /> : undefined}
        />
        <Indicador
          rotulo="Expedientes cerrados"
          valor={numero(ganados.length)}
          icono="cheque"
          acento="#2FB6A3"
          variacion={variacion(ganados.length, ganadosAntes.length)}
          apoyo={tasaCierre !== null ? `${porcentaje(tasaCierre)} de cierre` : "sin base"}
        />
        <Indicador
          rotulo="Inversión en pauta"
          valor={dineroCorto(totalPauta.gasto)}
          icono="megafono"
          acento="#E63A58"
          invertido
          variacion={variacion(totalPauta.gasto, totalPautaPrevia.gasto)}
          apoyo={`${numero(totalPauta.clics)} clics`}
        />
        <Indicador
          rotulo="Costo por solicitud"
          valor={cpl !== null ? dineroCorto(cpl) : "—"}
          icono="monedas"
          acento="#D9AE83"
          invertido
          variacion={cpl !== null && cplPrevio !== null ? variacion(cpl, cplPrevio) : null}
          apoyo={meta?.cpl_meta ? `meta ${dineroCorto(meta.cpl_meta)}` : "pauta ÷ solicitudes"}
        />
      </div>

      {/* ---------- entrada de solicitudes + embudo ---------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Entrada de solicitudes"
            apoyo={`Una barra por día en ${rango.etiqueta.toLowerCase()}. Los días sin solicitudes se dibujan en cero.`}
          />
          <div className="mt-4">
            <Linea serie={serieLeads} color="#FF4D6D" alto={230} />
          </div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta
            titulo="Embudo del pipeline"
            apoyo="Cuántos expedientes llegaron a cada etapa, sobre el total histórico. La última columna es lo que pasó desde la etapa anterior."
            accion={
              <Link href="/crm" className="text-[0.76rem] font-semibold text-coral hover:underline">
                Ver tablero
              </Link>
            }
          />
          <div className="mt-4">
            {pipeline.length === 0 ? (
              <Vacio
                icono="embudo"
                titulo="El pipeline está vacío"
                texto="En cuanto entre la primera solicitud del sitio, aparecerá aquí en la etapa «Nuevo»."
              />
            ) : (
              <>
                <Embudo etapas={embudo} />
                <div className="mt-4 flex items-baseline justify-between border-t border-hair pt-3">
                  <span className="text-[0.76rem] text-slate">Valor del pipeline abierto</span>
                  <span className="cifra text-[0.95rem] font-semibold text-ink">{dinero(valorPipeline)}</span>
                </div>
              </>
            )}
          </div>
        </Tarjeta>
      </div>

      {/* ---------- bloque financiero, sólo para quien puede verlo ---------- */}
      {veFinanzas && <BloqueFinanciero />}

      {/* ---------- últimas solicitudes + pauta + pendientes ---------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Últimas solicitudes"
            apoyo="Lo más reciente que llegó del sitio web."
            accion={
              <Link href="/solicitudes" className="text-[0.76rem] font-semibold text-coral hover:underline">
                Ver todas
              </Link>
            }
          />
          {nuevos.length === 0 ? (
            <Vacio
              icono="bandeja"
              titulo="Sin solicitudes en el periodo"
              texto="El formulario de somosavansa.com escribe directo en esta base. Cuando alguien lo llene, aparece aquí en segundos."
            />
          ) : (
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Persona</Th>
                <Th>Estado</Th>
                <Th>Etapa</Th>
                <Th numerica>Saldo declarado</Th>
                <Th numerica>Entró</Th>
              </Encabezados>
              <tbody>
                {nuevos.slice(0, 7).map((l) => (
                  <Fila key={l.id}>
                    <Td>
                      <Link href={`/crm/${l.id}`} className="block min-w-0">
                        <span className="block truncate font-semibold text-ink hover:text-coral">{l.nombre}</span>
                        <span className="block truncate text-[0.72rem] text-slate">{l.telefono}</span>
                      </Link>
                    </Td>
                    <Td><span className="text-slate">{l.estado_republica ?? "—"}</span></Td>
                    <Td>
                      <Insignia color={ETAPA[l.estado].color}>{ETAPA[l.estado].nombre}</Insignia>
                    </Td>
                    <Td numerica>{l.saldo_subcuenta ? dineroCorto(l.saldo_subcuenta) : "—"}</Td>
                    <Td numerica><span className="text-slate">{haceCuanto(l.created_at)}</span></Td>
                  </Fila>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta>
            <CabezaTarjeta
              titulo="Pauta por campaña"
              apoyo="Inversión del periodo y su costo por lead."
              accion={
                <Link href="/marketing" className="text-[0.76rem] font-semibold text-coral hover:underline">
                  Detalle
                </Link>
              }
            />
            <div className="mt-4">
              {ranking.length === 0 ? (
                <Vacio
                  icono="megafono"
                  titulo="Sin pauta registrada"
                  texto="Captura las campañas de Meta y su métrica diaria para ver aquí el costo real por solicitud."
                  accion={<BotonEnlace href="/marketing" tamano="sm" tono="claro">Ir a Marketing</BotonEnlace>}
                />
              ) : (
                <BarrasHorizontales datos={ranking} maximoFilas={5} />
              )}
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta titulo="Próximas acciones" apoyo="Compromisos agendados con personas." />
            <div className="mt-3">
              {pendientes.length === 0 ? (
                <p className="py-6 text-center text-[0.8rem] text-slate">
                  Nadie tiene una acción agendada. Se agendan desde la ficha del expediente.
                </p>
              ) : (
                <ul className="divide-y divide-hair">
                  {pendientes.map((l) => {
                    const vencida = l.fecha_proxima_accion! < new Date().toISOString().slice(0, 10);
                    return (
                      <li key={l.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${vencida ? "bg-coral-50 text-coral" : "bg-mist text-slate"}`}>
                          <Icono nombre={vencida ? "alerta" : "reloj"} className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/crm/${l.id}`} className="block truncate text-[0.8rem] font-semibold text-ink hover:text-coral">
                            {l.nombre}
                          </Link>
                          <span className="block truncate text-[0.72rem] text-slate">
                            {l.proxima_accion ?? "Seguimiento"}
                          </span>
                        </span>
                        <span className={`shrink-0 text-[0.72rem] font-semibold ${vencida ? "text-coral" : "text-slate"}`}>
                          {fecha(l.fecha_proxima_accion)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Tarjeta>
        </div>
      </div>

      <ClasificacionResumen pipeline={pipeline} />
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Ingresos, egresos y márgenes de los últimos seis meses. Se separa en su
 * propio componente para que la página principal no cargue estas consultas
 * cuando quien mira es un asesor.
 */
async function BloqueFinanciero() {
  const meses = ultimosMeses(6);
  const datos = await Promise.all(
    meses.map(async (m) => ({
      periodo: m.periodo,
      er: calcular(contables(await movimientosEnRango(m.desde, m.hasta))),
    })),
  );

  const ultimo = datos[datos.length - 1].er;
  const anterior = datos[datos.length - 2]?.er;

  const barras = datos.map((d, i) => ({
    etiqueta: new Intl.DateTimeFormat("es-MX", { month: "short" }).format(
      new Date(new Date().getFullYear(), new Date().getMonth() - (datos.length - 1 - i), 1),
    ),
    valores: [
      { nombre: "Ingresos", valor: d.er.ingresos, color: "#2FB6A3" },
      { nombre: "Egresos", valor: d.er.egresosEfectivo, color: "#FF4D6D" },
    ],
  }));

  const sinDatos = datos.every((d) => d.er.ingresos === 0 && d.er.egresos === 0);

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
      <Tarjeta>
        <CabezaTarjeta
          titulo="Ingresos contra egresos"
          apoyo="Últimos seis meses. Los egresos excluyen la depreciación: es lo que de verdad salió de la cuenta."
          accion={
            <Link href="/finanzas" className="text-[0.76rem] font-semibold text-coral hover:underline">
              Ver finanzas
            </Link>
          }
        />
        <div className="mt-4">
          {sinDatos ? (
            <Vacio
              icono="monedas"
              titulo="Todavía no hay movimientos"
              texto="Captura ingresos y egresos para que el sistema calcule margen bruto, EBITDA y utilidad neta."
              accion={<BotonEnlace href="/finanzas/nuevo" tamano="sm" tono="coral">Registrar movimiento</BotonEnlace>}
            />
          ) : (
            <Barras datos={barras} />
          )}
        </div>
      </Tarjeta>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <Indicador
          rotulo="Ingresos del mes"
          valor={dineroCorto(ultimo.ingresos)}
          icono="subir"
          acento="#2FB6A3"
          variacion={anterior ? variacion(ultimo.ingresos, anterior.ingresos) : null}
        />
        <Indicador
          rotulo="Margen bruto"
          valor={porcentaje(ultimo.margenBruto)}
          icono="destello"
          acento="#0F2D3D"
          apoyo={`${dineroCorto(ultimo.utilidadBruta)} de utilidad bruta`}
          variacion={anterior && anterior.margenBruto !== null && ultimo.margenBruto !== null
            ? ultimo.margenBruto - anterior.margenBruto
            : null}
        />
        <Indicador
          rotulo="EBITDA del mes"
          valor={dineroCorto(ultimo.ebitda)}
          icono="reporte"
          acento={ultimo.ebitda >= 0 ? "#2FB6A3" : "#FF4D6D"}
          apoyo={`margen ${porcentaje(ultimo.margenEbitda)}`}
          variacion={anterior ? variacion(ultimo.ebitda, anterior.ebitda) : null}
        />
      </div>
    </div>
  );
}

/** Cómo se reparte el pipeline entre A, B, C y D. */
function ClasificacionResumen({ pipeline }: { pipeline: { clasificacion: string | null; estado: string }[] }) {
  const abiertos = pipeline.filter((l) => l.estado !== "cerrado" && l.estado !== "descartado");
  const total = abiertos.length;
  if (total === 0) return null;

  const grados = (["A", "B", "C", "D"] as const).map((g) => ({
    grado: g,
    ...CLASIFICACIONES[g],
    total: abiertos.filter((l) => l.clasificacion === g).length,
  }));
  const sinClasificar = abiertos.filter((l) => !l.clasificacion).length;

  return (
    <Tarjeta className="mt-4">
      <CabezaTarjeta
        titulo="Clasificación de viabilidad"
        apoyo="Del pipeline abierto. Es la clasificación interna de avansa: no sustituye la precalificación del Infonavit."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {grados.map((g) => (
          <div key={g.grado} className="rounded-xl bg-mist p-3.5">
            <div className="flex items-center justify-between">
              <span className="grid size-7 place-items-center rounded-lg text-[0.8rem] font-bold text-white"
                    style={{ background: g.color }}>
                {g.grado}
              </span>
              <span className="cifra text-[1.1rem] font-semibold text-ink">{numero(g.total)}</span>
            </div>
            <p className="mt-2 text-[0.78rem] font-semibold text-ink">{g.nombre.split(" · ")[1]}</p>
            <p className="mt-0.5 text-[0.7rem] leading-snug text-slate">{g.descripcion}</p>
          </div>
        ))}
      </div>
      {sinClasificar > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-[0.75rem] text-slate">
          <Icono nombre="alerta" className="size-3.5 text-sand" />
          {numero(sinClasificar)} {sinClasificar === 1 ? "expediente sigue" : "expedientes siguen"} sin clasificar.
        </p>
      )}
    </Tarjeta>
  );
}
