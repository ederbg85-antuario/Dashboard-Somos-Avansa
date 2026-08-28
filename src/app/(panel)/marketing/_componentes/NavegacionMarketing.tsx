"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MarcaPlataforma } from "./MarcaPlataforma";

const PESTANAS = [
  { href: "/marketing", etiqueta: "Resumen", plataforma: "avansa", exacta: true },
  { href: "/marketing/meta", etiqueta: "Meta Ads", plataforma: "meta" },
  { href: "/marketing/search-console", etiqueta: "Search Console", plataforma: "search" },
  { href: "/marketing/instagram", etiqueta: "Instagram", plataforma: "instagram" },
  { href: "/marketing/contenido", etiqueta: "Calendario", plataforma: "calendario", sinPeriodo: true },
] as const;

export function NavegacionMarketing() {
  const ruta = usePathname();
  const params = useSearchParams();
  const periodo = params.get("periodo");

  return (
    <nav aria-label="Secciones de Marketing" className="no-imprimir mt-5 overflow-x-auto pb-1">
      <div className="flex min-w-max items-center gap-1.5 rounded-2xl bg-white/90 p-1.5 shadow-tarjeta ring-1 ring-hair">
        {PESTANAS.map((pestana) => {
          const activa = "exacta" in pestana && pestana.exacta ? ruta === pestana.href : ruta.startsWith(pestana.href);
          const href = periodo && !("sinPeriodo" in pestana)
            ? `${pestana.href}?periodo=${encodeURIComponent(periodo)}`
            : pestana.href;

          return (
            <Link
              key={pestana.href}
              href={href}
              aria-current={activa ? "page" : undefined}
              className={`group inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[0.78rem] font-semibold transition duration-200 ${
                activa
                  ? "bg-deep text-white shadow-tarjeta"
                  : "text-slate hover:-translate-y-px hover:bg-mist hover:text-ink"
              }`}
            >
              <span className={`grid size-6 place-items-center rounded-lg ${activa ? "bg-white" : "bg-white ring-1 ring-hair"}`}>
                <MarcaPlataforma plataforma={pestana.plataforma} className="size-4" />
              </span>
              {pestana.etiqueta}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
