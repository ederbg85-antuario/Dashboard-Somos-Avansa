import type { ComponentProps, ReactNode } from "react";

/**
 * Campos de formulario.
 *
 * Un solo estilo para todo el panel: alto de 40 px, filete claro, y foco
 * coral. El `<label>` siempre envuelve al control, así que el área de clic
 * incluye la etiqueta y no hace falta cablear `htmlFor` en cada pantalla.
 */

const controlBase =
  "w-full rounded-xl bg-white px-3 text-[0.85rem] text-ink ring-1 ring-hair transition " +
  "placeholder:text-slate-400 hover:ring-hair-fuerte " +
  "focus:outline-none focus:ring-2 focus:ring-coral " +
  "disabled:cursor-not-allowed disabled:bg-mist disabled:text-slate";

export function Etiqueta({
  children, requerido = false, ayuda,
}: { children: ReactNode; requerido?: boolean; ayuda?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline gap-1.5">
      <span className="text-[0.78rem] font-semibold text-ink">{children}</span>
      {requerido && <span className="text-coral" aria-hidden="true">*</span>}
      {ayuda && <span className="text-[0.72rem] font-normal text-slate">{ayuda}</span>}
    </span>
  );
}

export function Campo({
  etiqueta, requerido, ayuda, error, className = "", ...props
}: ComponentProps<"input"> & { etiqueta: string; requerido?: boolean; ayuda?: string; error?: string }) {
  return (
    <label className={`block ${className}`}>
      <Etiqueta requerido={requerido} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <input {...props} required={requerido} className={`${controlBase} h-10`} />
      {error && <span className="mt-1 block text-[0.72rem] text-coral">{error}</span>}
    </label>
  );
}

export function CampoTexto({
  etiqueta, requerido, ayuda, className = "", filas = 3, ...props
}: ComponentProps<"textarea"> & { etiqueta: string; requerido?: boolean; ayuda?: string; filas?: number }) {
  return (
    <label className={`block ${className}`}>
      <Etiqueta requerido={requerido} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <textarea {...props} rows={filas} required={requerido}
        className={`${controlBase} resize-y py-2.5 leading-relaxed`} />
    </label>
  );
}

export function CampoSelect({
  etiqueta, requerido, ayuda, className = "", children, ...props
}: ComponentProps<"select"> & { etiqueta: string; requerido?: boolean; ayuda?: string }) {
  return (
    <label className={`block ${className}`}>
      <Etiqueta requerido={requerido} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <div className="relative">
        <select {...props} required={requerido}
          className={`${controlBase} h-10 cursor-pointer appearance-none pr-9`}>
          {children}
        </select>
        <svg viewBox="0 0 24 24" aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </label>
  );
}

/**
 * Campo de dinero. El símbolo va dentro del control y el número se alinea a
 * la derecha con cifras tabulares: así se captura una columna de montos sin
 * que bailen los decimales.
 */
export function CampoMonto({
  etiqueta, requerido, ayuda, className = "", ...props
}: ComponentProps<"input"> & { etiqueta: string; requerido?: boolean; ayuda?: string }) {
  return (
    <label className={`block ${className}`}>
      <Etiqueta requerido={requerido} ayuda={ayuda}>{etiqueta}</Etiqueta>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.85rem] font-semibold text-slate">$</span>
        <input
          {...props}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          required={requerido}
          className={`${controlBase} cifra h-10 pl-7 text-right`}
        />
      </div>
    </label>
  );
}

/** Casilla con su texto al lado, alineada a la primera línea. */
export function Casilla({
  etiqueta, descripcion, className = "", ...props
}: ComponentProps<"input"> & { etiqueta: string; descripcion?: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${className}`}>
      <input
        {...props}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-hair-fuerte text-coral accent-coral"
      />
      <span>
        <span className="block text-[0.82rem] font-medium text-ink">{etiqueta}</span>
        {descripcion && <span className="block text-[0.75rem] leading-snug text-slate">{descripcion}</span>}
      </span>
    </label>
  );
}
