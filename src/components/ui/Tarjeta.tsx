import type { ReactNode } from "react";

/**
 * La superficie base del panel. La elevación y el contraste de fondo separan
 * contenido sin convertir una pantalla densa en una cuadrícula de bordes.
 */
export function Tarjeta({
  children, className = "", padding = true,
}: { children: ReactNode; className?: string; padding?: boolean }) {
  return (
    <section
      className={`rounded-2xl bg-white shadow-tarjeta ${padding ? "p-5" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function CabezaTarjeta({
  titulo, apoyo, accion, className = "",
}: { titulo: ReactNode; apoyo?: ReactNode; accion?: ReactNode; className?: string }) {
  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-[0.95rem] font-semibold tracking-tight text-ink">{titulo}</h2>
        {apoyo && <p className="mt-0.5 text-[0.8rem] leading-snug text-slate">{apoyo}</p>}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </header>
  );
}
