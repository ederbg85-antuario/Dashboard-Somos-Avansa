import { dineroCompacto, numero } from "@/lib/formato";
import { escalaBonita } from "./Linea";

export type BarraDato = {
  etiqueta: string;
  /** Una o más series apiladas o pareadas. */
  valores: { nombre: string; valor: number; color: string }[];
};

/**
 * Barras verticales, agrupadas o apiladas.
 *
 * Se usa agrupada para comparar ingresos contra egresos mes a mes, y apilada
 * para descomponer un total en sus partes.
 */
export function Barras({
  datos, alto = 240, formato = "dinero", apilado = false, leyenda = true,
}: {
  datos: BarraDato[];
  alto?: number;
  formato?: "numero" | "dinero";
  apilado?: boolean;
  leyenda?: boolean;
}) {
  const W = 720;
  const H = alto;
  const M = { arriba: 14, derecha: 12, abajo: 28, izquierda: 56 };
  const anchoUtil = W - M.izquierda - M.derecha;
  const altoUtil = H - M.arriba - M.abajo;

  if (datos.length === 0) {
    return <p className="py-10 text-center text-[0.8rem] text-slate">Sin datos en el periodo.</p>;
  }

  const fmt = formato === "dinero" ? dineroCompacto : numero;

  const totalDe = (d: BarraDato) =>
    apilado ? d.valores.reduce((s, v) => s + v.valor, 0) : Math.max(...d.valores.map((v) => v.valor));
  const tope = escalaBonita(Math.max(...datos.map(totalDe), 1));

  const anchoGrupo = anchoUtil / datos.length;
  const relleno = Math.min(anchoGrupo * 0.28, 22);
  const anchoBarra = apilado
    ? anchoGrupo - relleno
    : (anchoGrupo - relleno) / Math.max(datos[0].valores.length, 1);

  const y = (v: number) => M.arriba + altoUtil - (v / tope) * altoUtil;
  const series = datos[0]?.valores.map((v) => ({ nombre: v.nombre, color: v.color })) ?? [];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
           aria-label={`Barras de ${datos.length} periodos`}>
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const yy = M.arriba + altoUtil - r * altoUtil;
          return (
            <g key={r}>
              <line x1={M.izquierda} y1={yy} x2={W - M.derecha} y2={yy}
                    stroke="#E4E9ED" strokeWidth="1" strokeDasharray={r === 0 ? undefined : "3 4"} />
              <text x={M.izquierda - 8} y={yy + 3.5} textAnchor="end" className="cifra"
                    fill="#9AA5B1" fontSize="10">{fmt(tope * r)}</text>
            </g>
          );
        })}

        {datos.map((d, i) => {
          const x0 = M.izquierda + i * anchoGrupo + relleno / 2;
          let acumulado = 0;

          return (
            <g key={d.etiqueta + i}>
              {d.valores.map((v, j) => {
                const altura = Math.max((v.valor / tope) * altoUtil, v.valor > 0 ? 2 : 0);
                const yy = apilado
                  ? M.arriba + altoUtil - (acumulado + v.valor) / tope * altoUtil
                  : y(v.valor);
                const xx = apilado ? x0 : x0 + j * anchoBarra;
                if (apilado) acumulado += v.valor;

                return (
                  <rect key={v.nombre} x={xx} y={yy}
                        width={Math.max(anchoBarra - (apilado ? 0 : 2), 2)} height={altura}
                        rx={Math.min(4, anchoBarra / 3)} fill={v.color}>
                    <title>{`${d.etiqueta} · ${v.nombre}: ${fmt(v.valor)}`}</title>
                  </rect>
                );
              })}
              <text x={M.izquierda + i * anchoGrupo + anchoGrupo / 2} y={H - 9}
                    textAnchor="middle" fill="#9AA5B1" fontSize="10">{d.etiqueta}</text>
            </g>
          );
        })}
      </svg>

      {leyenda && series.length > 1 && (
        <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
          {series.map((s) => (
            <li key={s.nombre} className="flex items-center gap-1.5 text-[0.75rem] text-slate">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
              {s.nombre}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Barras horizontales para rankings: campañas por gasto, categorías por
 * monto, asesores por cierres. Cuando lo que importa es el orden y las
 * etiquetas son largas, horizontal se lee mejor que vertical.
 */
export function BarrasHorizontales({
  datos, formato = "dinero", maximoFilas = 8,
}: {
  datos: { etiqueta: string; valor: number; color: string; nota?: string }[];
  formato?: "numero" | "dinero";
  maximoFilas?: number;
}) {
  const fmt = formato === "dinero" ? dineroCompacto : numero;
  const visibles = datos.slice(0, maximoFilas);
  const max = Math.max(...visibles.map((d) => d.valor), 1);

  if (visibles.length === 0) {
    return <p className="py-8 text-center text-[0.8rem] text-slate">Sin datos en el periodo.</p>;
  }

  return (
    <ul className="space-y-3">
      {visibles.map((d) => (
        <li key={d.etiqueta}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8rem] font-medium text-ink" title={d.etiqueta}>
              {d.etiqueta}
            </span>
            <span className="cifra shrink-0 text-[0.8rem] font-semibold text-ink">{fmt(d.valor)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
              <div className="h-full rounded-full" style={{ width: `${(d.valor / max) * 100}%`, background: d.color }} />
            </div>
            {d.nota && <span className="cifra w-16 shrink-0 text-right text-[0.72rem] text-slate">{d.nota}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
