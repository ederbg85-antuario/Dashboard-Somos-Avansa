import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Cascada, type PasoCascada } from "@/components/graficas/Cascada";
import { Indicador } from "@/components/ui/Indicador";
import { NATURALEZAS } from "@/lib/constantes";
import { calcular, costoDeAdquisicion, renglones, roas, ticketPromedio } from "@/lib/finanzas";
import { dinero, dineroCorto, mes as nombreMes, numero, porcentaje } from "@/lib/formato";
import { resolverPeriodo, ultimosMeses, variacion } from "@/lib/periodo";
import { contables, leadsCerrados, movimientosEnRango } from "@/lib/datos";
import { exigirRol } from "@/lib/supabase/sesion";

export const metadata: Metadata = { title: "Estado de resultados" };
export const dynamic = "force-dynamic";

/**
 * El estado de resultados, con la cascada completa.
 *
 * Todo sale de `lib/finanzas.ts`: la misma función que alimenta el tablero y
 * el módulo de finanzas. No hay un segundo cálculo «para el reporte», que es
 * como acaban existiendo dos verdades sobre el mismo mes.
 */
export default async function Reportes({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo ?? "mes");

  const meses = ultimosMeses(6);
  const [movimientos, previos, cerrados, historia] = await Promise.all([
    movimientosEnRango(rango.desde, rango.hasta),
    movimientosEnRango(rango.anterior.desde, rango.anterior.hasta),
    leadsCerrados(rango.desde, rango.hasta),
    Promise.all(meses.map(async (m) => ({
      periodo: m.periodo,
      er: calcular(contables(await movimientosEnRango(m.desde, m.hasta))),
    }))),
  ]);

  const er = calcular(contables(movimientos));
  const erPrevio = calcular(contables(previos));
  const filas = renglones(er);

  const ganados = cerrados.filter((l) => l.estado === "cerrado").length;
  const inversionMarketing = er.totales.gasto_marketing;

  const cac = costoDeAdquisicion(inversionMarketing, ganados);
  const retorno = roas(er.ingresos, inversionMarketing);
  const ticket = ticketPromedio(er.ingresos, ganados);

  const pasos: PasoCascada[] = [
    { etiqueta: "Ingresos", monto: er.ingresos, tipo: "total", color: "#2FB6A3" },
    { etiqueta: "Costo directo", monto: er.costoDirecto, tipo: "resta", color: "#FF4D6D" },
    { etiqueta: "Utilidad bruta", monto: er.utilidadBruta, tipo: "total", color: "#1E9E8D" },
    { etiqueta: "Marketing", monto: er.totales.gasto_marketing, tipo: "resta", color: "#E63A58" },
    { etiqueta: "Operación", monto: er.totales.gasto_operativo, tipo: "resta", color: "#0F2D3D" },
    { etiqueta: "Administración", monto: er.totales.gasto_administrativo, tipo: "resta", color: "#6B7785" },
    { etiqueta: "EBITDA", monto: er.ebitda, tipo: "total", color: "#0F2D3D" },
    { etiqueta: "Depreciación", monto: er.depreciacion, tipo: "resta", color: "#D9AE83" },
    { etiqueta: "Financieros", monto: er.financiero, tipo: "resta", color: "#C79A6E" },
    { etiqueta: "Impuestos", monto: er.impuestos, tipo: "resta", color: "#A8804F" },
    { etiqueta: "Utilidad neta", monto: er.utilidadNeta, tipo: "total", color: er.utilidadNeta >= 0 ? "#2FB6A3" : "#FF4D6D" },
  ];

  const vacio = er.ingresos === 0 && er.egresos === 0;

  return (
    <>
      <Encabezado
        titulo="Estado de resultados"
        apoyo={`${rango.etiqueta} · del ${rango.desde} al ${rango.hasta}. Sólo entra lo efectivamente cobrado y pagado; lo pendiente se muestra aparte en Finanzas.`}
        acciones={<SelectorPeriodo actual={rango.clave} />}
      />

      {vacio ? (
        <Tarjeta>
          <Vacio
            icono="reporte"
            titulo="Todavía no hay movimientos en el periodo"
            texto="El estado de resultados se arma solo a partir de los movimientos que se capturen en Finanzas. No hay que llenar nada dos veces."
          />
        </Tarjeta>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador rotulo="Margen bruto" valor={porcentaje(er.margenBruto)} acento="#1E9E8D" icono="destello"
                       apoyo={dineroCorto(er.utilidadBruta)}
                       variacion={er.margenBruto !== null && erPrevio.margenBruto !== null ? er.margenBruto - erPrevio.margenBruto : null} />
            <Indicador rotulo="Margen EBITDA" valor={porcentaje(er.margenEbitda)}
                       acento={er.ebitda >= 0 ? "#0F2D3D" : "#FF4D6D"} icono="reporte"
                       apoyo={dineroCorto(er.ebitda)}
                       variacion={er.margenEbitda !== null && erPrevio.margenEbitda !== null ? er.margenEbitda - erPrevio.margenEbitda : null} />
            <Indicador rotulo="Margen neto" valor={porcentaje(er.margenNeto)}
                       acento={er.utilidadNeta >= 0 ? "#2FB6A3" : "#FF4D6D"} icono="monedas"
                       apoyo={dineroCorto(er.utilidadNeta)}
                       variacion={er.margenNeto !== null && erPrevio.margenNeto !== null ? er.margenNeto - erPrevio.margenNeto : null} />
            <Indicador rotulo="Flujo neto de caja" valor={dineroCorto(er.flujoNeto)}
                       acento={er.flujoNeto >= 0 ? "#2FB6A3" : "#FF4D6D"} icono="subir"
                       apoyo="ingresos − salidas reales"
                       variacion={variacion(er.flujoNeto, erPrevio.flujoNeto)} />
          </div>

          <Tarjeta className="mt-4">
            <CabezaTarjeta
              titulo="De dónde sale y a dónde se va"
              apoyo="Cada barra en negativo es lo que se lleva ese renglón. Las barras que descansan en cero son los tres cortes: utilidad bruta, EBITDA y utilidad neta."
              accion={
                <span className="no-imprimir hidden text-[0.72rem] text-slate sm:inline">
                  <Icono nombre="descargar" className="mr-1 inline size-3.5" />
                  Ctrl/⌘ + P para imprimir
                </span>
              }
            />
            <div className="mt-4"><Cascada pasos={pasos} /></div>
          </Tarjeta>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Tarjeta>
              <CabezaTarjeta titulo="Cascada renglón por renglón" apoyo="La columna de la derecha es el porcentaje sobre ingresos." />
              <Tabla className="mt-3">
                <Encabezados>
                  <Th>Concepto</Th>
                  <Th numerica>Importe</Th>
                  <Th numerica>% de ingresos</Th>
                </Encabezados>
                <tbody>
                  {filas.map((r) => {
                    const resultado = r.nivel === "resultado";
                    const negativo = resultado && r.monto < 0;
                    return (
                      <Fila key={r.clave}
                            className={resultado ? "!border-b-2 !border-hair-fuerte bg-mist/40" : ""}>
                        <Td>
                          <span
                            className={`${resultado ? "font-semibold text-ink" : "text-slate"} ${
                              r.nivel === "detalle" ? "pl-3" : ""
                            }`}
                            title={r.ayuda}
                          >
                            {r.nivel === "detalle" && <span className="mr-1.5 text-slate-400">−</span>}
                            {r.etiqueta}
                            {r.ayuda && (
                              <Icono nombre="sistema" className="ml-1 inline size-3 align-[-1px] text-slate-400" />
                            )}
                          </span>
                        </Td>
                        <Td numerica>
                          <span className={resultado ? "font-semibold" : ""}
                                style={{ color: negativo ? "#E63A58" : resultado ? "#0D1117" : "#6B7785" }}>
                            {dinero(r.monto)}
                          </span>
                        </Td>
                        <Td numerica>
                          <span className={resultado ? "font-semibold text-ink" : "text-slate"}>
                            {porcentaje(r.margen)}
                          </span>
                        </Td>
                      </Fila>
                    );
                  })}
                </tbody>
              </Tabla>

              <p className="mt-4 flex items-start gap-2 rounded-xl bg-mist px-3.5 py-2.5 text-[0.75rem] leading-relaxed text-slate">
                <Icono nombre="sistema" className="mt-px size-3.5 shrink-0" />
                La depreciación va debajo del EBITDA a propósito: no es salida de
                efectivo, y sumarla arriba haría que el EBITDA dejara de ser EBITDA.
              </p>
            </Tarjeta>

            <div className="space-y-4">
              <Tarjeta>
                <CabezaTarjeta titulo="Adquisición" apoyo="Lo que cuesta y lo que rinde traer clientes." />
                <dl className="mt-4 space-y-3">
                  <Metrica rotulo="Costo de adquisición (CAC)"
                           valor={cac !== null ? dinero(cac) : "—"}
                           nota={`${numero(ganados)} expedientes cerrados en el periodo`} />
                  <Metrica rotulo="Retorno de la pauta (ROAS)"
                           valor={retorno !== null ? `${retorno.toFixed(2)}×` : "—"}
                           nota={`${dineroCorto(inversionMarketing)} invertidos en marketing`} />
                  <Metrica rotulo="Ticket promedio"
                           valor={ticket !== null ? dinero(ticket) : "—"}
                           nota="ingresos ÷ expedientes cerrados" />
                  <Metrica rotulo="Marketing sobre ingresos"
                           valor={porcentaje(er.ingresos > 0 ? (inversionMarketing * 100) / er.ingresos : null)}
                           nota="qué proporción del ingreso se reinvierte" />
                </dl>
              </Tarjeta>

              <Tarjeta>
                <CabezaTarjeta titulo="Composición del gasto" apoyo="Del total de egresos del periodo." />
                <ul className="mt-4 space-y-2.5">
                  {(Object.keys(NATURALEZAS) as (keyof typeof NATURALEZAS)[])
                    .filter((n) => n !== "ingreso" && er.totales[n] > 0)
                    .sort((a, b) => er.totales[b] - er.totales[a])
                    .map((n) => {
                      const parte = er.egresos > 0 ? (er.totales[n] * 100) / er.egresos : 0;
                      return (
                        <li key={n}>
                          <div className="flex items-baseline justify-between gap-3 text-[0.8rem]">
                            <span className="truncate text-slate" title={NATURALEZAS[n].ayuda}>
                              {NATURALEZAS[n].nombre}
                            </span>
                            <span className="cifra shrink-0 font-semibold text-ink">
                              {dineroCorto(er.totales[n])}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-mist">
                            <div className="h-full rounded-full"
                                 style={{ width: `${parte}%`, background: NATURALEZAS[n].color }} />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              </Tarjeta>
            </div>
          </div>

          <Tarjeta className="mt-4">
            <CabezaTarjeta titulo="Mes a mes" apoyo="Últimos seis meses cerrados con el mismo criterio." />
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Mes</Th>
                <Th numerica>Ingresos</Th>
                <Th numerica>Costo directo</Th>
                <Th numerica>Utilidad bruta</Th>
                <Th numerica>M. bruto</Th>
                <Th numerica>Gastos operativos</Th>
                <Th numerica>EBITDA</Th>
                <Th numerica>M. EBITDA</Th>
                <Th numerica>Utilidad neta</Th>
                <Th numerica>M. neto</Th>
              </Encabezados>
              <tbody>
                {[...historia].reverse().map((h) => (
                  <Fila key={h.periodo}>
                    <Td><span className="font-medium capitalize text-ink">{nombreMes(h.periodo)}</span></Td>
                    <Td numerica>{dinero(h.er.ingresos)}</Td>
                    <Td numerica><span className="text-slate">{dinero(h.er.costoDirecto)}</span></Td>
                    <Td numerica>{dinero(h.er.utilidadBruta)}</Td>
                    <Td numerica><span className="text-slate">{porcentaje(h.er.margenBruto)}</span></Td>
                    <Td numerica><span className="text-slate">{dinero(h.er.gastosOperativos)}</span></Td>
                    <Td numerica>
                      <span className="font-semibold" style={{ color: h.er.ebitda >= 0 ? "#1E9E8D" : "#E63A58" }}>
                        {dinero(h.er.ebitda)}
                      </span>
                    </Td>
                    <Td numerica><span className="text-slate">{porcentaje(h.er.margenEbitda)}</span></Td>
                    <Td numerica>
                      <span className="font-semibold" style={{ color: h.er.utilidadNeta >= 0 ? "#0D1117" : "#E63A58" }}>
                        {dinero(h.er.utilidadNeta)}
                      </span>
                    </Td>
                    <Td numerica><span className="text-slate">{porcentaje(h.er.margenNeto)}</span></Td>
                  </Fila>
                ))}
              </tbody>
            </Tabla>
          </Tarjeta>
        </>
      )}
    </>
  );
}

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="border-b border-hair pb-3 last:border-0 last:pb-0">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-slate">{rotulo}</dt>
      <dd className="cifra mt-1 text-[1.15rem] font-semibold leading-none text-ink">{valor}</dd>
      <p className="mt-1 text-[0.72rem] text-slate">{nota}</p>
    </div>
  );
}
