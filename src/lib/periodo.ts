import { finDeMes, haceDias, inicioDeMes, iso } from "./formato";

/**
 * Resolución del periodo que se está viendo.
 *
 * Cada rango trae además el rango *anterior* de la misma longitud. Todas las
 * variaciones del panel («+18 % contra el periodo anterior») salen de aquí, y
 * por eso se calculan en un solo lugar: comparar 30 días contra un mes
 * natural es el error clásico que hace que un tablero mienta sin mostrar una
 * sola cifra falsa.
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

const diasEntre = (desde: string, hasta: string) =>
  Math.round(
    (new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86_400_000,
  ) + 1;

function conAnterior(clave: string, etiqueta: string, desde: string, hasta: string): Rango {
  const dias = diasEntre(desde, hasta);
  const finAnterior = haceDias(1, new Date(`${desde}T00:00:00`));
  const inicioAnterior = haceDias(dias - 1, new Date(`${finAnterior}T00:00:00`));
  return { clave, etiqueta, desde, hasta, dias, anterior: { desde: inicioAnterior, hasta: finAnterior } };
}

export function resolverPeriodo(clave: string | undefined, hoy = new Date()): Rango {
  const fin = iso(hoy);

  switch (clave) {
    case "7d":
      return conAnterior("7d", "Últimos 7 días", haceDias(6, hoy), fin);
    case "90d":
      return conAnterior("90d", "Últimos 90 días", haceDias(89, hoy), fin);
    case "mes":
      return conAnterior("mes", "Este mes", inicioDeMes(hoy), fin);
    case "ano":
      return conAnterior("ano", "Este año", iso(new Date(hoy.getFullYear(), 0, 1)), fin);
    case "30d":
    default:
      return conAnterior("30d", "Últimos 30 días", haceDias(29, hoy), fin);
  }
}

/** El mes natural completo que contiene a `fecha`. Lo usa el reporte contable. */
export function mesNatural(fecha = new Date()): Rango {
  return conAnterior("mes-natural", "Mes completo", inicioDeMes(fecha), finDeMes(fecha));
}

/** Los últimos `n` meses como rangos, del más viejo al más nuevo. */
export function ultimosMeses(
  n: number,
  hoy = new Date(),
): { periodo: string; desde: string; hasta: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1 - i), 1);
    return { periodo: inicioDeMes(d), desde: inicioDeMes(d), hasta: finDeMes(d) };
  });
}

/** Todos los días del rango, para no dejar huecos en las series de tiempo. */
export function diasDelRango(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${desde}T00:00:00`);
  const tope = new Date(`${hasta}T00:00:00`);
  while (cursor <= tope) {
    dias.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

/** Variación porcentual entre dos periodos. `null` si no hay base de comparación. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}
