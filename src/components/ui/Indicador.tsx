import type { ReactNode } from "react";
import { Icono, type NombreIcono } from "./Icono";

/**
 * La tarjeta de cifra del tablero.
 *
 * Tres reglas: la cifra manda (es lo más grande), el rótulo va arriba y
 * pequeño, y la comparación va abajo con su signo. Sin la comparación un
 * número no dice nada — «120 leads» sólo significa algo contra el mes pasado.
 */
export function Indicador({
  rotulo, valor, apoyo, variacion, icono, acento = "#0F2D3D",
  invertido = false, extra,
}: {
  rotulo: string;
  valor: ReactNode;
  apoyo?: ReactNode;
  /** Variación porcentual contra el periodo anterior. */
  variacion?: number | null;
  icono?: NombreIcono;
  acento?: string;
  /** `true` cuando subir es malo (costo por lead, gasto). */
  invertido?: boolean;
  extra?: ReactNode;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl bg-white p-4 ring-1 ring-hair shadow-tarjeta">
      {/* Filete de color: identifica el indicador de un vistazo sin teñir la tarjeta. */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: acento }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-3 pl-1.5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-slate">
          {rotulo}
        </p>
        {icono && (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg"
                style={{ background: `${acento}14`, color: acento }}>
            <Icono nombre={icono} className="size-4" />
          </span>
        )}
      </div>

      <p className="cifra mt-2 pl-1.5 text-[1.65rem] font-semibold leading-none tracking-tight text-ink">
        {valor}
      </p>

      {(apoyo || variacion !== undefined) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-1.5">
          {variacion !== undefined && <Variacion valor={variacion} invertido={invertido} />}
          {apoyo && <span className="text-[0.75rem] leading-tight text-slate">{apoyo}</span>}
        </div>
      )}

      {extra && <div className="mt-3 pl-1.5">{extra}</div>}
    </article>
  );
}

/**
 * Flecha con el porcentaje de cambio. El color no depende del signo sino de
 * si el cambio es bueno: que el costo por lead baje se pinta en verde.
 */
export function Variacion({
  valor, invertido = false,
}: { valor: number | null | undefined; invertido?: boolean }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return <span className="text-[0.75rem] text-slate-400">sin comparativo</span>;
  }

  const plano = Math.abs(valor) < 0.5;
  const bueno = invertido ? valor < 0 : valor > 0;
  const color = plano ? "#6B7785" : bueno ? "#1E9E8D" : "#E63A58";

  return (
    <span
      className="cifra inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.72rem] font-semibold"
      style={{ background: `${color}14`, color }}
    >
      {!plano && <Icono nombre={valor > 0 ? "subir" : "bajar"} className="size-3" grosor={2.4} />}
      {plano ? "sin cambio" : `${Math.abs(valor).toFixed(1)} %`}
    </span>
  );
}

/** Barra de avance contra meta. */
export function Avance({
  logrado, meta, color = "#2FB6A3", etiqueta,
}: { logrado: number; meta: number; color?: string; etiqueta?: string }) {
  const pct = meta > 0 ? Math.min((logrado / meta) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[0.72rem] text-slate">
        <span>{etiqueta ?? "Avance"}</span>
        <span className="cifra font-semibold" style={{ color: meta > 0 ? color : undefined }}>
          {meta > 0 ? `${pct.toFixed(0)} %` : "sin meta"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}
