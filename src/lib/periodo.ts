import { diasEntre, finDeMes, haceDias, inicioDeAno, inicioDeMes, iso, sumarDias, sumarMeses } from "./formato";

/**
 * Resolución del periodo que se está viendo.
 *
 * Todo se calcula sobre fechas civiles (`YYYY-MM-DD`) en la zona del negocio,
 * nunca sobre objetos `Date` del proceso: el servidor de producción corre en
 * UTC y ahí «hoy» empieza seis horas antes que en México.
 *
 * Cada rango trae además el rango *anterior* de la misma longitud. Todas las
 * variaciones del panel («+18 % contra el periodo anterior») salen de aquí, y
 * por eso se calculan en un solo lugar: comparar 30 días contra un mes natural
 * es el error clásico que hace que un tablero mienta sin mostrar una sola
 * cifra falsa.
 */
export type Rango = {
  clave: string;
  etiqueta: string;
  desde: string;
  hasta: string;
  /** Mismo número de días, inmediatamente antes. */
  anterior: { desde: string; hasta: string };
  dias: number;
};

function conAnterior(clave: string, etiqueta: string, desde: string, hasta: string): Rango {
  const dias = diasEntre(desde, hasta);
  const finAnterior = sumarDias(desde, -1);
  return {
    clave, etiqueta, desde, hasta, dias,
    anterior: { desde: sumarDias(finAnterior, -(dias - 1)), hasta: finAnterior },
  };
}

export function resolverPeriodo(clave: string | undefined, hoy: string = iso()): Rango {
  switch (clave) {
    case "7d":
      return conAnterior("7d", "Últimos 7 días", haceDias(6, hoy), hoy);
    case "90d":
      return conAnterior("90d", "Últimos 90 días", haceDias(89, hoy), hoy);
    case "mes":
      return conAnterior("mes", "Este mes", inicioDeMes(hoy), hoy);
    case "ano":
      return conAnterior("ano", "Este año", inicioDeAno(hoy), hoy);
    case "30d":
    default:
      return conAnterior("30d", "Últimos 30 días", haceDias(29, hoy), hoy);
  }
}

/** El mes natural completo que contiene a `fecha`. Lo usa el reporte contable. */
export function mesNatural(fecha: string = iso()): Rango {
  return conAnterior("mes-natural", "Mes completo", inicioDeMes(fecha), finDeMes(fecha));
}

/** Los últimos `n` meses como rangos, del más viejo al más nuevo. */
export function ultimosMeses(
  n: number,
  hoy: string = iso(),
): { periodo: string; desde: string; hasta: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const primero = sumarMeses(inicioDeMes(hoy), -(n - 1 - i));
    return { periodo: primero, desde: primero, hasta: finDeMes(primero) };
  });
}

/** Todos los días del rango, para no dejar huecos en las series de tiempo. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const total = diasEntre(desde, hasta);
  return Array.from({ length: Math.max(total, 0) }, (_, i) => sumarDias(desde, i));
}

/** Variación porcentual entre dos periodos. `null` si no hay base de comparación. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}
