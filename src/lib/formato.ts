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
 * La zona horaria del negocio.
 *
 * No se hereda del proceso a propósito. En Vercel `TZ` es una variable
 * reservada —no se puede definir— y el contenedor arranca en UTC: una
 * solicitud recibida a las 20:00 en México aparecería con fecha del día
 * siguiente, y «este mes» empezaría seis horas antes de tiempo. Todo el
 * cálculo de fechas del panel pasa por aquí, de modo que el sistema da los
 * mismos números en la laptop de la oficina y en el servidor.
 */
export const ZONA = "America/Mexico_City";

const pad = (n: number) => String(n).padStart(2, "0");

/** `en-CA` formatea como `YYYY-MM-DD`, que es justo lo que se necesita. */
const fechaCivil = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
});

/**
 * Minutos de desfase de la zona respecto a UTC en ese instante.
 * Se calcula y no se fija en −360 porque, aunque México dejó el horario de
 * verano en 2022, la frontera norte sí lo conserva y la regla puede volver.
 */
function desfase(instante: Date): number {
  const enZona = new Date(instante.toLocaleString("en-US", { timeZone: ZONA }));
  const enUtc = new Date(instante.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((enZona.getTime() - enUtc.getTime()) / 60_000);
}

/** La fecha civil de un instante en la zona del negocio: `2026-08-20`. */
export const iso = (d: Date = new Date()): string => fechaCivil.format(d);

/** Las tres partes de una fecha civil, sin pasar por `Date`. */
const partes = (fecha: string): [number, number, number] => {
  const [y, m, d] = fecha.split("-").map(Number);
  return [y, m, d];
};

/**
 * Aritmética de días sobre fechas civiles.
 *
 * Se hace con `Date.UTC`, que no tiene zona: sumar un día nunca cae en el
 * agujero de un cambio de horario ni se corre por el desfase del servidor.
 */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = partes(fecha);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Fecha ISO de hace `n` días, contados desde la zona del negocio. */
export const haceDias = (n: number, desde: string = iso()) => sumarDias(desde, -n);

/** Primer día del mes al que pertenece `fecha`. */
export function inicioDeMes(fecha: string = iso()): string {
  const [y, m] = partes(fecha);
  return `${y}-${pad(m)}-01`;
}

/** Último día del mes al que pertenece `fecha`. */
export function finDeMes(fecha: string = iso()): string {
  const [y, m] = partes(fecha);
  const t = new Date(Date.UTC(y, m, 0));   // día 0 del mes siguiente
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Primer día del año al que pertenece `fecha`. */
export const inicioDeAno = (fecha: string = iso()) => `${partes(fecha)[0]}-01-01`;

/** Desplaza `fecha` `n` meses, quedándose en el día 1. */
export function sumarMeses(fecha: string, n: number): string {
  const [y, m] = partes(fecha);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

/** Días transcurridos entre dos fechas civiles, ambas incluidas. */
export function diasEntre(desde: string, hasta: string): number {
  const [ay, am, ad] = partes(desde);
  const [by, bm, bd] = partes(hasta);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000) + 1;
}

/**
 * Los extremos de un día civil, como instantes UTC.
 *
 * `leads.created_at` es `timestamptz`: comparar contra la cadena
 * «2026-08-01» la interpretaría en la zona de la sesión de Postgres (UTC) y
 * en México se perderían las seis primeras horas del día.
 */
export function inicioDelDia(fecha: string): string {
  const [y, m, d] = partes(fecha);
  const tentativo = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(tentativo - desfase(new Date(tentativo)) * 60_000).toISOString();
}

export function finDelDia(fecha: string): string {
  const [y, m, d] = partes(fecha);
  const tentativo = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  return new Date(tentativo - desfase(new Date(tentativo)) * 60_000).toISOString();
}

/**
 * Una fecha `YYYY-MM-DD` de Postgres no lleva zona. Interpretarla con
 * `new Date("2026-08-01")` la trae en UTC y al mostrarla en México se vería
 * como julio 31, así que se construye al mediodía para que ningún desfase la
 * mueva de día.
 */
export function comoFecha(valor: string | Date): Date {
  if (valor instanceof Date) return valor;
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloFecha) {
    const [, y, m, d] = soloFecha;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  }
  return new Date(valor);
}

const conZona = { timeZone: ZONA } as const;
const fechaCorta = new Intl.DateTimeFormat(LOCALE, { ...conZona, day: "2-digit", month: "short" });
const fechaLarga = new Intl.DateTimeFormat(LOCALE, { ...conZona, day: "2-digit", month: "long", year: "numeric" });
const conHora = new Intl.DateTimeFormat(LOCALE, {
  ...conZona, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
});
const mesLargo = new Intl.DateTimeFormat(LOCALE, { ...conZona, month: "long", year: "numeric" });
const mesCorto = new Intl.DateTimeFormat(LOCALE, { ...conZona, month: "short" });

export const fecha = (v: string | Date | null | undefined) =>
  v ? fechaCorta.format(comoFecha(v)) : "—";

export const fechaCompleta = (v: string | Date | null | undefined) =>
  v ? fechaLarga.format(comoFecha(v)) : "—";

export const fechaHora = (v: string | Date | null | undefined) =>
  v ? conHora.format(comoFecha(v)) : "—";

export const mes = (v: string | Date | null | undefined) =>
  v ? mesLargo.format(comoFecha(v)) : "—";

/** `ago` — para los ejes de las gráficas mensuales. */
export const mesAbreviado = (v: string | Date | null | undefined) =>
  v ? mesCorto.format(comoFecha(v)).replace(".", "") : "—";

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

/** Iniciales para el avatar: `Laura Méndez` → `LM`. */
export function iniciales(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
