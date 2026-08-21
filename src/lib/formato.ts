/**
 * Formato de números, dinero y fechas. Todo el panel escribe cifras a través
 * de aquí para que un peso se vea igual en el tablero, en la tabla y en el
 * estado de resultados.
 */

const LOCALE = "es-MX";

const pesos = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pesosCortos = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const enteros = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

/** `$12,450.00` */
export const dinero = (n: number | null | undefined) => pesos.format(n ?? 0);

/** `$12,450` — para tarjetas y ejes de gráfica, donde los centavos estorban. */
export const dineroCorto = (n: number | null | undefined) => pesosCortos.format(n ?? 0);

/**
 * `$1.2 M` / `$45.3 k`. Sólo para etiquetas de gráfica: en tablas y en el
 * estado de resultados siempre va la cifra completa.
 */
export function dineroCompacto(n: number | null | undefined): string {
  const v = n ?? 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${v < 0 ? "−" : ""}$${(abs / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `${v < 0 ? "−" : ""}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)} k`;
  return pesosCortos.format(v);
}

export const numero = (n: number | null | undefined) => enteros.format(n ?? 0);

/** `18.4 %`. Recibe el porcentaje ya calculado, no la fracción. */
export function porcentaje(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(decimales).replace(/\.0+$/, "")} %`;
}

/** Divide sin explotar cuando el denominador es cero. */
export const dividir = (a: number, b: number) => (b > 0 ? a / b : null);

/** Porcentaje de `parte` sobre `total`, o `null` si no hay base. */
export const razon = (parte: number, total: number) =>
  total > 0 ? (parte * 100) / total : null;

// ---------- fechas --------------------------------------------------------

/**
 * Una fecha `YYYY-MM-DD` de Postgres no lleva zona horaria. Interpretarla con
 * `new Date("2026-08-01")` la trae en UTC y en México se ve como julio 31. Por
 * eso se construye a mano en hora local.
 */
export function comoFecha(valor: string | Date): Date {
  if (valor instanceof Date) return valor;
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloFecha) {
    return new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]));
  }
  return new Date(valor);
}

const fechaCorta = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "short" });
const fechaLarga = new Intl.DateTimeFormat(LOCALE, { day: "2-digit", month: "long", year: "numeric" });
const conHora = new Intl.DateTimeFormat(LOCALE, {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});
const mesLargo = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });

export const fecha = (v: string | Date | null | undefined) =>
  v ? fechaCorta.format(comoFecha(v)) : "—";

export const fechaCompleta = (v: string | Date | null | undefined) =>
  v ? fechaLarga.format(comoFecha(v)) : "—";

export const fechaHora = (v: string | Date | null | undefined) =>
  v ? conHora.format(comoFecha(v)) : "—";

export const mes = (v: string | Date | null | undefined) =>
  v ? mesLargo.format(comoFecha(v)) : "—";

/** `hace 3 días`, `en 2 semanas`. */
export function haceCuanto(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  const dias = Math.round((comoFecha(v).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(dias) < 1) return "hoy";
  if (Math.abs(dias) < 30) return rtf.format(dias, "day");
  if (Math.abs(dias) < 365) return rtf.format(Math.round(dias / 30), "month");
  return rtf.format(Math.round(dias / 365), "year");
}

/** `2026-08-20` en hora local, que es lo que espera un `<input type="date">`. */
export function iso(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Primer día del mes de `d`, en formato ISO. */
export function inicioDeMes(d: Date = new Date()): string {
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Último día del mes de `d`, en formato ISO. */
export function finDeMes(d: Date = new Date()): string {
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Fecha ISO de hace `n` días. */
export function haceDias(n: number, desde: Date = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() - n);
  return iso(d);
}

/**
 * Límites de un día local convertidos a instante UTC.
 *
 * `leads.created_at` es `timestamptz`: comparar contra la cadena "2026-08-01"
 * la interpretaría en la zona de la sesión de Postgres (UTC) y en México se
 * perderían las seis primeras horas del día. Estas dos funciones construyen
 * el instante correcto a partir de la hora local del proceso — por eso el
 * despliegue fija `TZ=America/Mexico_City`.
 */
export const inicioDelDia = (fechaLocal: string) =>
  new Date(`${fechaLocal}T00:00:00`).toISOString();

export const finDelDia = (fechaLocal: string) =>
  new Date(`${fechaLocal}T23:59:59.999`).toISOString();

/** Iniciales para el avatar: `Laura Méndez` → `LM`. */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
