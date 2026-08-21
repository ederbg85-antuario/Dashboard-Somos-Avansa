import { dineroCompacto, numero, porcentaje } from "@/lib/formato";

export type Rebanada = { etiqueta: string; valor: number; color: string };

/**
 * Dona con el total en el centro.
 *
 * Se usa sólo para composición — de qué se compone el gasto — y nunca para
 * comparar periodos: el ojo compara longitudes mucho mejor que ángulos.
 * Cuando hay más de seis partes, la cola se agrupa en «Otros».
 */
export function Dona({
  datos, formato = "dinero", titulo, subtitulo, maximo = 6,
}: {
  datos: Rebanada[];
  formato?: "numero" | "dinero";
  titulo?: string;
  subtitulo?: string;
  maximo?: number;
}) {
  const fmt = formato === "dinero" ? dineroCompacto : numero;
  const positivos = datos.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor);

  const partes =
    positivos.length > maximo
      ? [
          ...positivos.slice(0, maximo - 1),
          {
            etiqueta: "Otros",
            color: "#C3CBD3",
            valor: positivos.slice(maximo - 1).reduce((s, d) => s + d.valor, 0),
          },
        ]
      : positivos;

  const total = partes.reduce((s, d) => s + d.valor, 0);

  if (total === 0) {
    return <p className="py-10 text-center text-[0.8rem] text-slate">Sin movimientos en el periodo.</p>;
  }

  const R = 54;
  const grosor = 18;
  const circunferencia = 2 * Math.PI * R;

  // Cada arco se dibuja con `stroke-dasharray` y se corre con `dashoffset`.
  // El desfase se calcula aquí, antes del JSX: acumular una variable dentro
  // del `map` de un render es frágil, y con seis rebanadas el costo de
  // sumar lo anterior en cada vuelta es irrelevante.
  const rebanadas = partes.map((d, i) => {
    const previo = partes.slice(0, i).reduce((s, x) => s + x.valor, 0);
    return {
      ...d,
      largo: (d.valor / total) * circunferencia,
      desfase: -(previo / total) * circunferencia,
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="size-36" role="img" aria-label={titulo ?? "Composición"}>
          <g transform="rotate(-90 70 70)">
            {rebanadas.map((d) => (
              <circle key={d.etiqueta} cx="70" cy="70" r={R} fill="none"
                      stroke={d.color} strokeWidth={grosor}
                      strokeDasharray={`${d.largo} ${circunferencia - d.largo}`}
                      strokeDashoffset={d.desfase}>
                <title>{`${d.etiqueta}: ${fmt(d.valor)} (${porcentaje((d.valor / total) * 100)})`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="cifra text-[1.05rem] font-semibold leading-none text-ink">{fmt(total)}</p>
          {subtitulo && <p className="mt-1 text-[0.68rem] text-slate">{subtitulo}</p>}
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2">
        {partes.map((d) => (
          <li key={d.etiqueta} className="flex items-center gap-2.5 text-[0.8rem]">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-slate" title={d.etiqueta}>{d.etiqueta}</span>
            <span className="cifra shrink-0 font-semibold text-ink">{fmt(d.valor)}</span>
            <span className="cifra w-12 shrink-0 text-right text-[0.72rem] text-slate-400">
              {porcentaje((d.valor / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
