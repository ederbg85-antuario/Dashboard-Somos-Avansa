import type { ReactNode } from "react";

/**
 * Etiqueta de estado. El color llega como hex desde `constantes.ts` — no como
 * clase de Tailwind — porque los colores de etapa, clasificación y categoría
 * los define el catálogo y algunos son editables desde la base.
 */
export function Insignia({
  children, color = "#6B7785", solida = false, className = "",
}: { children: ReactNode; color?: string; solida?: boolean; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold leading-none whitespace-nowrap ${className}`}
      style={
        solida
          ? { background: color, color: "#fff" }
          : { background: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}2E` }
      }
    >
      {children}
    </span>
  );
}

/** Punto de color a secas, para listas densas donde una insignia sería mucho. */
export function Punto({ color, className = "" }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}
