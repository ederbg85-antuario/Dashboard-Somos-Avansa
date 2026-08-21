import type { ReactNode } from "react";
import { Icono, type NombreIcono } from "./Icono";

/**
 * Estado vacío. Nunca dice sólo «sin datos»: dice por qué está vacío y qué
 * hacer para llenarlo. Un panel recién instalado está vacío en todas partes,
 * y es justo ahí donde hay que explicar el sistema.
 */
export function Vacio({
  icono = "bandeja", titulo, texto, accion,
}: { icono?: NombreIcono; titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-mist text-slate-400">
        <Icono nombre={icono} className="size-6" />
      </span>
      <div>
        <p className="text-[0.9rem] font-semibold text-ink">{titulo}</p>
        {texto && <p className="mx-auto mt-1 max-w-sm text-[0.82rem] leading-relaxed text-slate">{texto}</p>}
      </div>
      {accion}
    </div>
  );
}
