import { dineroCompacto, numero } from "@/lib/formato";

export type PuntoSerie = { etiqueta: string; valor: number };

/**
 * Gráfica de línea con área.
 *
 * SVG puro, sin librería y sin JavaScript en el cliente: se renderiza en el
 * servidor con el resto de la página. El `<title>` de cada punto da el
 * tooltip nativo del navegador, que además lee el lector de pantalla — un
 * tooltip pintado a mano no hace ninguna de las dos cosas.
 */
export function Linea({
  serie, color = "#FF4D6D", alto = 220, formato = "numero", etiquetasX = 6, comparativo,
}: {
  serie: PuntoSerie[];
  color?: string;
  alto?: number;
  formato?: "numero" | "dinero";
  /** Cuántas etiquetas del eje X mostrar como máximo. */
  etiquetasX?: number;
  /** Segunda serie, en gris, para comparar contra el periodo anterior. */
  comparativo?: { serie: PuntoSerie[]; color?: string; nombre?: string };
}) {
  const W = 720;
  const H = alto;
  const M = { arriba: 16, derecha: 12, abajo: 26, izquierda: 52 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;

  if (serie.length === 0) {
    return <p className="py-10 text-center text-[0.8rem] text-slate">Sin datos en el periodo.</p>;
  }

  const fmt = formato === "dinero" ? dineroCompacto : numero;
  const todos = [...serie.map((p) => p.valor), ...(comparativo?.serie.map((p) => p.valor) ?? [])];
  // El eje siempre arranca en cero: si no, una variación del 2 % parece un
  // desplome y el tablero miente sin decir una sola cifra falsa.
  const max = Math.max(...todos, 1);
  const tope = escalaBonita(max);

  const x = (i: number, largo: number) =>
    M.izquierda + (largo <= 1 ? anchoUtil / 2 : (i * anchoUtil) / (largo - 1));
  const y = (v: number) => M.arriba + altoUtil - (v / tope) * altoUtil;

  const camino = (datos: PuntoSerie[]) =>
    datos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i, datos.length).toFixed(2)} ${y(p.valor).toFixed(2)}`).join(" ");

  const area = `${camino(serie)} L ${x(serie.length - 1, serie.length).toFixed(2)} ${M.arriba + altoUtil} L ${x(0, serie.length).toFixed(2)} ${M.arriba + altoUtil} Z`;

  const lineasY = [0, 0.25, 0.5, 0.75, 1];
  const paso = Math.max(1, Math.ceil(serie.length / etiquetasX));
  const id = `area-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
         aria-label={`Serie de ${serie.length} puntos, máximo ${fmt(max)}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* rejilla horizontal y eje de valores */}
      {lineasY.map((r) => {
        const yy = M.arriba + altoUtil - r * altoUtil;
        return (
          <g key={r}>
            <line x1={M.izquierda} y1={yy} x2={W - M.derecha} y2={yy}
                  stroke="#E4E9ED" strokeWidth="1" strokeDasharray={r === 0 ? undefined : "3 4"} />
            <text x={M.izquierda - 8} y={yy + 3.5} textAnchor="end"
                  className="cifra" fill="#9AA5B1" fontSize="10">
              {fmt(tope * r)}
            </text>
          </g>
        );
      })}

      {comparativo && comparativo.serie.length > 1 && (
        <path d={camino(comparativo.serie)} fill="none"
              stroke={comparativo.color ?? "#C3CBD3"} strokeWidth="1.6"
              strokeDasharray="4 4" strokeLinecap="round" />
      )}

      <path d={area} fill={`url(#${id})`} />
      <path d={camino(serie)} fill="none" stroke={color} strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" />

      {/* puntos: sólo se dibujan si no se amontonan */}
      {serie.length <= 32 && serie.map((p, i) => (
        <circle key={p.etiqueta + i} cx={x(i, serie.length)} cy={y(p.valor)} r="3"
                fill="#fff" stroke={color} strokeWidth="2">
          <title>{`${p.etiqueta}: ${fmt(p.valor)}`}</title>
        </circle>
      ))}

      {/* zonas invisibles para que el tooltip funcione en series largas */}
      {serie.length > 32 && serie.map((p, i) => (
        <rect key={p.etiqueta + i} x={x(i, serie.length) - anchoUtil / serie.length / 2}
              y={M.arriba} width={anchoUtil / serie.length} height={altoUtil} fill="transparent">
          <title>{`${p.etiqueta}: ${fmt(p.valor)}`}</title>
        </rect>
      ))}

      {serie.map((p, i) =>
        i % paso === 0 || i === serie.length - 1 ? (
          <text key={`x-${p.etiqueta}-${i}`} x={x(i, serie.length)} y={H - 8}
                textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}
                fill="#9AA5B1" fontSize="10">
            {p.etiqueta}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/**
 * Redondea el tope del eje al siguiente número «limpio» (1, 2, 2.5 o 5 por
 * potencia de diez). Sin esto el eje se rotula con 8 731 y nadie lee eso.
 */
export function escalaBonita(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  const normal = max / potencia;
  const escalon = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 2.5 ? 2.5 : normal <= 5 ? 5 : 10;
  return escalon * potencia;
}
