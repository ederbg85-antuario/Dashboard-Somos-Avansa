import type { ReactNode } from "react";

/**
 * Tabla del panel.
 *
 * Sin líneas verticales y con una sola línea horizontal por fila: en una
 * tabla de doce columnas la rejilla completa compite con los datos. El
 * contenedor tiene su propio scroll horizontal para que la página nunca se
 * desplace de lado en pantallas chicas.
 */
export function Tabla({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`-mx-5 overflow-x-auto px-5 ${className}`}>
      <table className="w-full min-w-max border-collapse text-left text-[0.82rem]">
        {children}
      </table>
    </div>
  );
}

export function Encabezados({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-hair">{children}</tr>
    </thead>
  );
}

export function Th({
  children, numerica = false, className = "",
}: { children?: ReactNode; numerica?: boolean; className?: string }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-slate ${
        numerica ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Fila({
  children, className = "",
}: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-b border-hair/70 transition last:border-0 hover:bg-mist/60 ${className}`}>
      {children}
    </tr>
  );
}

export function Td({
  children, numerica = false, className = "", colSpan,
}: { children?: ReactNode; numerica?: boolean; className?: string; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2.5 align-middle ${numerica ? "cifra text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
