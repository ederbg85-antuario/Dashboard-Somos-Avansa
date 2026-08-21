"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS } from "@/lib/constantes";
import type { LeadEstado } from "@/lib/supabase/tipos";
import { cambiarEtapa } from "./acciones";

/**
 * Selector de etapa dentro de la tarjeta del tablero.
 *
 * Se prefirió un `<select>` a arrastrar y soltar: el tablero se usa en
 * teléfono tanto como en escritorio, arrastrar en móvil pelea con el scroll
 * horizontal de las columnas, y un select es accesible por teclado sin
 * escribir una sola línea de gestión de foco.
 */
export function MoverEtapa({
  id, actual, compacto = false,
}: { id: string; actual: LeadEstado; compacto?: boolean }) {
  const router = useRouter();
  const [moviendo, empezar] = useTransition();

  return (
    <select
      aria-label="Mover de etapa"
      value={actual}
      disabled={moviendo}
      onChange={(e) => {
        const destino = e.target.value as LeadEstado;
        if (destino === actual) return;
        const motivo =
          destino === "descartado"
            ? window.prompt("¿Por qué se descarta? Queda en la bitácora.") ?? undefined
            : undefined;
        empezar(async () => {
          await cambiarEtapa(id, destino, motivo);
          router.refresh();
        });
      }}
      className={`w-full cursor-pointer rounded-lg bg-mist text-slate transition hover:bg-hair hover:text-ink focus:outline-none focus:ring-2 focus:ring-coral disabled:opacity-50 ${
        compacto ? "h-7 px-2 text-[0.7rem]" : "h-8 px-2.5 text-[0.75rem]"
      } ${moviendo ? "animate-latir" : ""}`}
    >
      {ETAPAS.map((e) => (
        <option key={e.clave} value={e.clave}>
          {/* La opción seleccionada es la que se ve con el select cerrado:
              ahí va el nombre de la etapa a secas. La flecha sólo tiene
              sentido en las opciones que sí mueven el expediente. */}
          {moviendo ? "Moviendo…" : e.clave === actual ? e.nombre : `→ ${e.nombre}`}
        </option>
      ))}
    </select>
  );
}
