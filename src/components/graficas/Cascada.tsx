import { dineroCompacto } from "@/lib/formato";

export type PasoCascada = {
  etiqueta: string;
  monto: number;
  /** `total` descansa en cero (subtotales); `resta` cuelga del acumulado. */
  tipo: "total" | "resta";
  color: string;
};

/**
 * Cascada del estado de resultados.
 *
 * Es la gráfica que explica el negocio de un vistazo: de dónde parte el
 * ingreso, cuánto se lleva cada renglón y qué queda en cada corte. Las barras
 * de subtotal descansan en cero; las de gasto cuelgan del acumulado anterior,
 * que es lo que hace visible el «tamaño del mordisco».
 *
 * El cero no está forzado al piso: si el EBITDA sale negativo, la barra baja
 * y se ve. Un panel financiero que no puede dibujar una pérdida no sirve.
 */
export function Cascada({ pasos, alto = 280 }: { pasos: PasoCascada[]; alto?: number }) {
  const W = 760;
  const H = alto;
  const M = { arriba: 26, derecha: 12, abajo: 46, izquierda: 58 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;

  if (pasos.length === 0 || pasos.every((p) => p.monto === 0)) {
    return <p className="py-12 text-center text-[0.8rem] text-slate">Sin movimientos en el periodo.</p>;
  }

  // Recorre la cascada acumulando para saber de dónde a dónde va cada barra.
  // Se hace con un `reduce` y no mutando una variable suelta: en un render de
  // React una variable que se reasigna dentro del `map` es una trampa, y aquí
  // además el fold expresa mejor lo que es — un recorrido con memoria.
  const barras = pasos.reduce<{
    filas: (PasoCascada & { desde: number; hasta: number })[];
    acumulado: number;
  }>(
    (estado, p) => {
      const hasta = p.tipo === "total" ? p.monto : estado.acumulado - p.monto;
      const desde = p.tipo === "total" ? 0 : estado.acumulado;
      return { filas: [...estado.filas, { ...p, desde, hasta }], acumulado: hasta };
    },
    { filas: [], acumulado: 0 },
  ).filas;

  const valores = barras.flatMap((b) => [b.desde, b.hasta]);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;

  const y = (v: number) => M.arriba + altoUtil - ((v - min) / rango) * altoUtil;
  const yCero = y(0);

  const anchoPaso = anchoUtil / barras.length;
  const anchoBarra = Math.min(anchoPaso * 0.62, 48);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
         aria-label="Cascada del estado de resultados">
      {/* rejilla */}
      {[0, 0.5, 1].map((r) => {
        const yy = M.arriba + altoUtil - r * altoUtil;
        return (
          <g key={r}>
            <line x1={M.izquierda} y1={yy} x2={W - M.derecha} y2={yy}
                  stroke="var(--color-hair)" strokeWidth="1" strokeDasharray="3 4" />
            <text x={M.izquierda - 8} y={yy + 3.5} textAnchor="end" className="cifra"
                  fill="var(--color-slate-400)" fontSize="10">{dineroCompacto(min + r * rango)}</text>
          </g>
        );
      })}

      {/* la línea del cero se marca sólida: es la frontera entre ganar y perder */}
      <line x1={M.izquierda} y1={yCero} x2={W - M.derecha} y2={yCero}
            stroke="var(--color-hair-fuerte)" strokeWidth="1.2" />

      {barras.map((b, i) => {
        const cx = M.izquierda + i * anchoPaso + anchoPaso / 2;
        const x0 = cx - anchoBarra / 2;
        const arriba = Math.min(y(b.desde), y(b.hasta));
        const altura = Math.max(Math.abs(y(b.desde) - y(b.hasta)), 2);
        const esTotal = b.tipo === "total";

        return (
          <g key={b.etiqueta + i}>
            {/* hilo que conecta con la barra anterior */}
            {i > 0 && (
              <line x1={M.izquierda + (i - 1) * anchoPaso + anchoPaso / 2 + anchoBarra / 2}
                    y1={y(barras[i - 1].hasta)}
                    x2={x0} y2={y(barras[i - 1].hasta)}
                    stroke="var(--color-hair-fuerte)" strokeWidth="1" strokeDasharray="2 3" />
            )}

            <rect x={x0} y={arriba} width={anchoBarra} height={altura} rx="4"
                  fill={b.color} opacity={esTotal ? 1 : 0.85}>
              <title>{`${b.etiqueta}: ${dineroCompacto(b.monto)}`}</title>
            </rect>

            <text x={cx} y={arriba - 6} textAnchor="middle" className="cifra"
                  fill={esTotal ? "var(--color-ink)" : "var(--color-slate)"}
                  fontSize="10" fontWeight={esTotal ? 600 : 400}>
              {esTotal ? dineroCompacto(b.monto) : `−${dineroCompacto(b.monto)}`}
            </text>

            <text x={cx} y={H - 26} textAnchor="middle" fill="var(--color-slate)" fontSize="9.5"
                  fontWeight={esTotal ? 600 : 400}>
              {primeraLinea(b.etiqueta)}
            </text>
            {segundaLinea(b.etiqueta) && (
              <text x={cx} y={H - 14} textAnchor="middle" fill="var(--color-slate-400)" fontSize="9.5">
                {segundaLinea(b.etiqueta)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* Las etiquetas se parten en dos renglones para que «Gastos de administración»
   no se encime con la barra de al lado. SVG no hace saltos de línea solo. */
const partir = (t: string) => {
  const palabras = t.split(" ");
  if (palabras.length < 2) return [t, ""] as const;
  const mitad = Math.ceil(palabras.length / 2);
  return [palabras.slice(0, mitad).join(" "), palabras.slice(mitad).join(" ")] as const;
};

const primeraLinea = (t: string) => partir(t)[0];
const segundaLinea = (t: string) => partir(t)[1];
