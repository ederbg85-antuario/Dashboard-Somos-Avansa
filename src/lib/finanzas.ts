import { NATURALEZAS_OPERATIVAS } from "@/lib/constantes";
import { razon } from "@/lib/formato";
import type { NaturalezaCuenta } from "@/lib/supabase/tipos";

/**
 * La cascada del estado de resultados.
 *
 * Es el único lugar donde se define qué es margen bruto, qué es EBITDA y qué
 * es utilidad neta. El panel, el reporte y la exportación llaman a la misma
 * función; la vista `v_estado_resultados_mensual` de Postgres es su espejo en
 * SQL para reportes y auditoría.
 *
 *   Ingresos
 *   − Costo directo ........................ Utilidad bruta   → margen bruto
 *   − Marketing + Operación + Administración  EBITDA           → margen EBITDA
 *   − Depreciación ......................... Utilidad operativa (EBIT)
 *   − Financieros − Impuestos .............. Utilidad neta    → margen neto
 *
 * La depreciación va *debajo* del EBITDA a propósito: no es salida de
 * efectivo, y meterla arriba haría que el EBITDA dejara de ser EBITDA.
 */

/** Lo mínimo que necesita el cálculo de cada movimiento. */
export type MovimientoContable = {
  monto: number;
  naturaleza: NaturalezaCuenta;
  /** Sólo lo efectivamente cobrado o pagado entra al resultado. */
  estatus?: "pagado" | "pendiente" | "cancelado";
  fecha?: string;
};

export type Totales = Record<NaturalezaCuenta, number>;

export type EstadoResultados = {
  totales: Totales;
  ingresos: number;
  costoDirecto: number;
  utilidadBruta: number;
  margenBruto: number | null;
  gastosOperativos: number;
  ebitda: number;
  margenEbitda: number | null;
  depreciacion: number;
  utilidadOperativa: number;
  margenOperativo: number | null;
  financiero: number;
  impuestos: number;
  utilidadNeta: number;
  margenNeto: number | null;
  /** Egresos totales, incluida la depreciación. Para el resumen de caja. */
  egresos: number;
  /** Salidas reales de efectivo: egresos menos depreciación. */
  egresosEfectivo: number;
  /** Ingresos − egresos de efectivo. */
  flujoNeto: number;
};

const CERO: Totales = {
  ingreso: 0,
  costo_directo: 0,
  gasto_operativo: 0,
  gasto_marketing: 0,
  gasto_administrativo: 0,
  depreciacion: 0,
  financiero: 0,
  impuestos: 0,
};

/** Suma los movimientos por naturaleza, ignorando lo no pagado. */
export function acumular(movimientos: MovimientoContable[]): Totales {
  const t: Totales = { ...CERO };
  for (const m of movimientos) {
    if (m.estatus && m.estatus !== "pagado") continue;
    t[m.naturaleza] += Number(m.monto) || 0;
  }
  return t;
}

/** Arma la cascada completa a partir de los totales por naturaleza. */
export function estadoDeResultados(totales: Totales): EstadoResultados {
  const ingresos = totales.ingreso;
  const costoDirecto = totales.costo_directo;
  const utilidadBruta = ingresos - costoDirecto;

  const gastosOperativos = NATURALEZAS_OPERATIVAS.reduce((s, n) => s + totales[n], 0);
  const ebitda = utilidadBruta - gastosOperativos;

  const depreciacion = totales.depreciacion;
  const utilidadOperativa = ebitda - depreciacion;

  const { financiero, impuestos } = totales;
  const utilidadNeta = utilidadOperativa - financiero - impuestos;

  const egresos =
    costoDirecto + gastosOperativos + depreciacion + financiero + impuestos;
  const egresosEfectivo = egresos - depreciacion;

  return {
    totales,
    ingresos,
    costoDirecto,
    utilidadBruta,
    margenBruto: razon(utilidadBruta, ingresos),
    gastosOperativos,
    ebitda,
    margenEbitda: razon(ebitda, ingresos),
    depreciacion,
    utilidadOperativa,
    margenOperativo: razon(utilidadOperativa, ingresos),
    financiero,
    impuestos,
    utilidadNeta,
    margenNeto: razon(utilidadNeta, ingresos),
    egresos,
    egresosEfectivo,
    flujoNeto: ingresos - egresosEfectivo,
  };
}

/** Atajo: de la lista de movimientos al estado de resultados. */
export const calcular = (movimientos: MovimientoContable[]) =>
  estadoDeResultados(acumular(movimientos));

/**
 * Un renglón del estado de resultados tal como se pinta en pantalla.
 * `nivel` gobierna la jerarquía visual; `esResultado` marca los subtotales.
 */
export type Renglon = {
  clave: string;
  etiqueta: string;
  monto: number;
  /** Porcentaje sobre ingresos, cuando tiene sentido mostrarlo. */
  margen: number | null;
  nivel: "titulo" | "detalle" | "resultado";
  /** `true` cuando el renglón resta (se pinta con signo negativo). */
  resta: boolean;
  ayuda?: string;
};

/** La cascada convertida en renglones listos para una tabla. */
export function renglones(er: EstadoResultados): Renglon[] {
  const m = (v: number) => razon(v, er.ingresos);
  return [
    { clave: "ingresos", etiqueta: "Ingresos", monto: er.ingresos, margen: er.ingresos > 0 ? 100 : null, nivel: "titulo", resta: false },
    { clave: "costo", etiqueta: "Costo directo del servicio", monto: er.costoDirecto, margen: m(er.costoDirecto), nivel: "detalle", resta: true, ayuda: "Comisiones, gestoría externa y todo lo que sólo se gasta cuando hay un expediente." },
    { clave: "utilidad-bruta", etiqueta: "Utilidad bruta", monto: er.utilidadBruta, margen: er.margenBruto, nivel: "resultado", resta: false, ayuda: "Lo que deja el servicio antes de los gastos de estructura." },
    { clave: "marketing", etiqueta: "Marketing y pauta", monto: er.totales.gasto_marketing, margen: m(er.totales.gasto_marketing), nivel: "detalle", resta: true },
    { clave: "operacion", etiqueta: "Gastos de operación", monto: er.totales.gasto_operativo, margen: m(er.totales.gasto_operativo), nivel: "detalle", resta: true },
    { clave: "administracion", etiqueta: "Gastos de administración", monto: er.totales.gasto_administrativo, margen: m(er.totales.gasto_administrativo), nivel: "detalle", resta: true },
    { clave: "ebitda", etiqueta: "EBITDA", monto: er.ebitda, margen: er.margenEbitda, nivel: "resultado", resta: false, ayuda: "Resultado de operación antes de depreciación, intereses e impuestos. Es la medida más cercana a la caja que genera el negocio." },
    { clave: "depreciacion", etiqueta: "Depreciación y amortización", monto: er.depreciacion, margen: m(er.depreciacion), nivel: "detalle", resta: true, ayuda: "No sale dinero: es el desgaste contable del equipo." },
    { clave: "ebit", etiqueta: "Utilidad operativa (EBIT)", monto: er.utilidadOperativa, margen: er.margenOperativo, nivel: "resultado", resta: false },
    { clave: "financiero", etiqueta: "Gastos financieros", monto: er.financiero, margen: m(er.financiero), nivel: "detalle", resta: true },
    { clave: "impuestos", etiqueta: "Impuestos", monto: er.impuestos, margen: m(er.impuestos), nivel: "detalle", resta: true },
    { clave: "utilidad-neta", etiqueta: "Utilidad neta", monto: er.utilidadNeta, margen: er.margenNeto, nivel: "resultado", resta: false, ayuda: "Lo que finalmente queda para la empresa." },
  ];
}

// ---------- indicadores de adquisición ------------------------------------

/**
 * Costo de adquisición: cuánto cuesta traer un cliente que además cierra.
 * Se calcula con la pauta y el contenido — no con toda la estructura —
 * porque es lo que se puede subir o bajar moviendo el presupuesto.
 */
export function costoDeAdquisicion(inversionMarketing: number, cierres: number) {
  return cierres > 0 ? inversionMarketing / cierres : null;
}

/** Retorno de la pauta: ingresos entre inversión publicitaria. */
export function roas(ingresos: number, inversionMarketing: number) {
  return inversionMarketing > 0 ? ingresos / inversionMarketing : null;
}

/** Ticket promedio por expediente cerrado. */
export function ticketPromedio(ingresos: number, cierres: number) {
  return cierres > 0 ? ingresos / cierres : null;
}
