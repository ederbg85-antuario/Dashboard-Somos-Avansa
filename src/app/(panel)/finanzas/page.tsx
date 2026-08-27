import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { Indicador } from "@/components/ui/Indicador";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/Boton";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { Dona } from "@/components/graficas/Dona";
import { Barras } from "@/components/graficas/Barras";
import { ESTATUS_MOVIMIENTO, NATURALEZAS } from "@/lib/constantes";
import { dinero, dineroCorto, fecha, mesAbreviado, numero, porcentaje } from "@/lib/formato";
import { resolverPeriodo, ultimosMeses, variacion } from "@/lib/periodo";
import { calcular } from "@/lib/finanzas";
import {
  campanas as cargarCampanas, categorias as cargarCategorias, contables,
  movimientosEnRango, pipelineCompleto,
} from "@/lib/datos";
import { exigirRol } from "@/lib/supabase/sesion";
import { cambiarEstatusMovimiento } from "./acciones";
import { CapturaMovimiento } from "./Formularios";

export const metadata: Metadata = { title: "Finanzas" };
export const dynamic = "force-dynamic";

export default async function Finanzas({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; tipo?: string }>;
}) {
  await exigirRol("admin");
  const { periodo, tipo } = await searchParams;
  // Finanzas abre en mes natural, no en 30 días corridos: una ventana móvil
  // cruza dos quincenas de nómina y un mes de renta contra un ingreso parcial,
  // y el EBITDA sale negativo por el corte, no por el negocio.
  const rango = resolverPeriodo(periodo ?? "mes");

  const meses = ultimosMeses(6);
  const [movimientos, previos, categorias, campanas, pipeline, porMes] = await Promise.all([
    movimientosEnRango(rango.desde, rango.hasta),
    movimientosEnRango(rango.anterior.desde, rango.anterior.hasta),
    cargarCategorias(),
    cargarCampanas(),
    pipelineCompleto(),
    Promise.all(meses.map(async (m) => ({
      periodo: m.periodo,
      er: calcular(contables(await movimientosEnRango(m.desde, m.hasta))),
    }))),
  ]);

  const er = calcular(contables(movimientos));
  const erPrevio = calcular(contables(previos));

  // Composición del gasto por categoría, sólo lo efectivamente pagado.
  const gastoPorCategoria = new Map<string, { etiqueta: string; valor: number; color: string }>();
  for (const m of movimientos) {
    if (m.tipo !== "egreso" || m.estatus !== "pagado" || !m.categoria) continue;
    const actual = gastoPorCategoria.get(m.categoria.id) ??
      { etiqueta: m.categoria.nombre, valor: 0, color: m.categoria.color };
    actual.valor += Number(m.monto);
    gastoPorCategoria.set(m.categoria.id, actual);
  }

  const barrasMes = porMes.map((d) => ({
    etiqueta: mesAbreviado(d.periodo),
    valores: [
      { nombre: "Ingresos", valor: d.er.ingresos, color: "#2FB6A3" },
      { nombre: "Egresos", valor: d.er.egresosEfectivo, color: "#FF4D6D" },
      { nombre: "EBITDA", valor: Math.max(d.er.ebitda, 0), color: "#0F2D3D" },
    ],
  }));

  const visibles = tipo ? movimientos.filter((m) => m.tipo === tipo) : movimientos;
  const pendientes = movimientos.filter((m) => m.estatus === "pendiente");

  const expedientes = pipeline
    .filter((l) => l.estado !== "descartado")
    .slice(0, 200)
    .map((l) => ({ id: l.id, nombre: l.nombre }));

  return (
    <>
      <Encabezado
        titulo="Finanzas"
        apoyo="Ingresos y egresos del periodo, con la cascada que va del ingreso al EBITDA y a la utilidad neta. Sólo cuenta lo efectivamente cobrado o pagado."
        acciones={
          <>
            <SelectorPeriodo actual={rango.clave} />
            <BotonEnlace href="/reportes" tono="claro">
              <Icono nombre="reporte" className="size-4" />
              Estado de resultados
            </BotonEnlace>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="Ingresos" valor={dineroCorto(er.ingresos)} icono="subir" acento="#2FB6A3"
          variacion={variacion(er.ingresos, erPrevio.ingresos)}
          apoyo={`${numero(movimientos.filter((m) => m.tipo === "ingreso").length)} movimientos`}
        />
        <Indicador
          rotulo="Egresos de caja" valor={dineroCorto(er.egresosEfectivo)} icono="bajar" acento="#FF4D6D" invertido
          variacion={variacion(er.egresosEfectivo, erPrevio.egresosEfectivo)}
          apoyo="sin depreciación"
        />
        <Indicador
          rotulo="Margen bruto" valor={porcentaje(er.margenBruto)} icono="destello" acento="#0F2D3D"
          apoyo={`${dineroCorto(er.utilidadBruta)} de utilidad bruta`}
          variacion={er.margenBruto !== null && erPrevio.margenBruto !== null
            ? er.margenBruto - erPrevio.margenBruto : null}
        />
        <Indicador
          rotulo="EBITDA" valor={dineroCorto(er.ebitda)}
          icono="reporte" acento={er.ebitda >= 0 ? "#2FB6A3" : "#FF4D6D"}
          apoyo={`margen ${porcentaje(er.margenEbitda)}`}
          variacion={variacion(er.ebitda, erPrevio.ebitda)}
        />
      </div>

      {pendientes.length > 0 && (
        <Tarjeta className="mt-4 !bg-sand-50 ring-sand-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[0.84rem] text-ink">
              <Icono nombre="reloj" className="size-4 shrink-0 text-sand" />
              <span>
                <strong className="font-semibold">{numero(pendientes.length)} movimientos pendientes</strong>{" "}
                por {dinero(pendientes.reduce((s, m) => s + Number(m.monto), 0))}. No entran al
                resultado hasta que se marquen como pagados.
              </span>
            </p>
          </div>
        </Tarjeta>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Ingresos, egresos y EBITDA"
            apoyo="Últimos seis meses. El EBITDA sólo se dibuja cuando es positivo; si sale negativo, la cifra está en el estado de resultados."
          />
          <div className="mt-4"><Barras datos={barrasMes} /></div>
        </Tarjeta>

        <Tarjeta>
          <CabezaTarjeta titulo="En qué se va el dinero" apoyo="Egresos pagados del periodo, por categoría." />
          <div className="mt-5">
            <Dona datos={[...gastoPorCategoria.values()]} subtitulo="egresos" />
          </div>
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Tarjeta>
          <CabezaTarjeta
            titulo="Movimientos"
            apoyo={`${numero(visibles.length)} en ${rango.etiqueta.toLowerCase()}.`}
            accion={
              <div className="flex gap-1">
                {[
                  { clave: "", etiqueta: "Todos" },
                  { clave: "ingreso", etiqueta: "Ingresos" },
                  { clave: "egreso", etiqueta: "Egresos" },
                ].map((f) => (
                  <a
                    key={f.clave || "todos"}
                    href={`/finanzas?periodo=${rango.clave}${f.clave ? `&tipo=${f.clave}` : ""}`}
                    className={`rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold transition ${
                      (tipo ?? "") === f.clave ? "bg-deep text-white" : "bg-mist text-slate hover:text-ink"
                    }`}
                  >
                    {f.etiqueta}
                  </a>
                ))}
              </div>
            }
          />

          {visibles.length === 0 ? (
            <Vacio
              icono="monedas"
              titulo="Sin movimientos en el periodo"
              texto="Registra el primero con el formulario de la derecha. En cuanto haya ingresos y egresos, el margen bruto, el EBITDA y la utilidad neta se calculan solos."
            />
          ) : (
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Fecha</Th>
                <Th>Concepto</Th>
                <Th>Categoría</Th>
                <Th>Renglón</Th>
                <Th numerica>Monto</Th>
                <Th>Estatus</Th>
              </Encabezados>
              <tbody>
                {visibles.slice(0, 80).map((m) => (
                  <Fila key={m.id}>
                    <Td numerica><span className="text-slate">{fecha(m.fecha)}</span></Td>
                    <Td>
                      <span className="block max-w-[22rem] truncate font-medium text-ink" title={m.concepto}>
                        {m.concepto}
                      </span>
                      {m.referencia && (
                        <span className="block text-[0.7rem] text-slate">{m.referencia}</span>
                      )}
                    </Td>
                    <Td><span className="text-slate">{m.categoria?.nombre ?? "—"}</span></Td>
                    <Td>
                      {m.categoria && (
                        <Insignia color={NATURALEZAS[m.categoria.naturaleza].color}>
                          {NATURALEZAS[m.categoria.naturaleza].corto}
                        </Insignia>
                      )}
                    </Td>
                    <Td numerica>
                      <span className="font-semibold" style={{ color: m.tipo === "ingreso" ? "#1E9E8D" : "#0D1117" }}>
                        {m.tipo === "ingreso" ? "+" : "−"}{dinero(m.monto)}
                      </span>
                      {Number(m.iva) > 0 && (
                        <span className="block text-[0.68rem] text-slate-400">IVA {dinero(m.iva)}</span>
                      )}
                    </Td>
                    <Td>
                      {m.estatus === "pendiente" ? (
                        <form action={cambiarEstatusMovimiento}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="estatus" value="pagado" />
                          <button type="submit"
                                  className="rounded-full bg-sand-50 px-2.5 py-1 text-[0.7rem] font-semibold text-sand transition hover:bg-sand hover:text-white"
                                  title="Marcar como pagado">
                            Marcar pagado
                          </button>
                        </form>
                      ) : (
                        <Insignia color={ESTATUS_MOVIMIENTO[m.estatus].color}>
                          {ESTATUS_MOVIMIENTO[m.estatus].nombre}
                        </Insignia>
                      )}
                    </Td>
                  </Fila>
                ))}
              </tbody>
            </Tabla>
          )}

          {visibles.length > 80 && (
            <p className="mt-3 text-[0.76rem] text-slate">
              Mostrando 80 de {numero(visibles.length)}. Acota el periodo para ver el resto.
            </p>
          )}
        </Tarjeta>

        <Tarjeta className="h-fit">
          <CabezaTarjeta
            titulo="Registrar movimiento"
            apoyo="El monto va sin IVA: así los márgenes no salen inflados."
          />
          <div className="mt-4">
            <CapturaMovimiento categorias={categorias} campanas={campanas} expedientes={expedientes} />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
