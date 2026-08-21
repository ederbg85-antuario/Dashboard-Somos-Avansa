"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Icono } from "@/components/ui/Icono";

/** Los rangos que de verdad se usan. Lo demás se cubre con «a la medida». */
export const PERIODOS = [
  { clave: "7d",  etiqueta: "7 días" },
  { clave: "30d", etiqueta: "30 días" },
  { clave: "mes", etiqueta: "Este mes" },
  { clave: "90d", etiqueta: "90 días" },
  { clave: "ano", etiqueta: "Este año" },
] as const;

export type ClavePeriodo = (typeof PERIODOS)[number]["clave"];

/**
 * Selector de periodo. Escribe en la URL en vez de en un estado local: así el
 * periodo sobrevive a recargar, se puede compartir el enlace de una vista
 * concreta, y el Server Component vuelve a consultar con el rango nuevo.
 */
export function SelectorPeriodo({ actual }: { actual: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [cargando, empezar] = useTransition();

  const cambiar = (clave: string) => {
    const siguientes = new URLSearchParams(params);
    siguientes.set("periodo", clave);
    empezar(() => router.replace(`${ruta}?${siguientes}`, { scroll: false }));
  };

  return (
    <div
      className={`no-imprimir inline-flex items-center rounded-xl bg-white p-1 ring-1 ring-hair shadow-tarjeta ${
        cargando ? "opacity-70" : ""
      }`}
      role="group"
      aria-label="Periodo"
    >
      <Icono nombre="calendario" className="ml-1.5 mr-1 size-4 text-slate-400" />
      {PERIODOS.map((p) => (
        <button
          key={p.clave}
          type="button"
          onClick={() => cambiar(p.clave)}
          aria-pressed={actual === p.clave}
          className={`rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold transition ${
            actual === p.clave ? "bg-deep text-white" : "text-slate hover:bg-mist hover:text-ink"
          }`}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
