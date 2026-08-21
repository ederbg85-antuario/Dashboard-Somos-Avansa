import type { ReactNode } from "react";

/**
 * Encabezado de página. Título, una línea que explica qué se está viendo, y
 * los controles del periodo o el botón de alta a la derecha.
 */
export function Encabezado({
  titulo, apoyo, acciones, children,
}: { titulo: string; apoyo?: ReactNode; acciones?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[1.4rem] font-semibold leading-tight tracking-tight text-ink">{titulo}</h1>
          {apoyo && <p className="mt-1 max-w-2xl text-[0.83rem] leading-relaxed text-slate">{apoyo}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
      {children}
    </header>
  );
}
