"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { iniciales } from "@/lib/formato";
import { ROLES } from "@/lib/constantes";
import type { RolUsuario } from "@/lib/supabase/tipos";
import type { Grupo } from "./navegacion";
import { CerrarSesion } from "./CerrarSesion";

/**
 * Barra lateral fija.
 *
 * En escritorio siempre está: el menú es el mapa del sistema y esconderlo
 * detrás de un botón obliga a recordarlo. En móvil se convierte en un cajón,
 * porque 260 px sobre 375 no dejan trabajar.
 */
export function BarraLateral({
  grupos, nombre, email, rol, avatarUrl,
}: { grupos: Grupo[]; nombre: string; email: string; rol: RolUsuario; avatarUrl: string | null }) {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState(false);

  const activa = (href: string, prefijo?: boolean) =>
    href === "/" ? ruta === "/" : prefijo ? ruta.startsWith(href) : ruta === href;

  return (
    <>
      {/* Barra superior sólo de móvil */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-hair bg-deep px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center">
          <Image src="/marca/logo/avansa-logo-on-dark.svg" alt="avansa"
                 width={116} height={24} priority className="h-6 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          className="grid size-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label={abierta ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={abierta}
        >
          <Icono nombre={abierta ? "cruz" : "menu"} />
        </button>
      </div>

      {abierta && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setAbierta(false)}
          className="fixed inset-0 z-30 bg-deep-900/40 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[262px] flex-col bg-deep transition-transform duration-300 lg:translate-x-0 ${
          abierta ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
          <Link href="/" onClick={() => setAbierta(false)} className="flex items-center">
            <Image src="/marca/logo/avansa-logo-on-dark.svg" alt="avansa · inicio"
                   width={130} height={27} priority className="h-[26px] w-auto" />
          </Link>
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="grid size-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 lg:hidden"
            aria-label="Cerrar menú"
          >
            <Icono nombre="cruz" className="size-4" />
          </button>
        </div>

        <p className="px-5 pb-4 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-white/35">
          Sistema integral
        </p>

        <nav className="scroll-oscuro flex-1 overflow-y-auto px-3 pb-4">
          {grupos.map((g) => (
            <div key={g.titulo} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-3 text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-white/30">
                {g.titulo}
              </p>
              <ul className="space-y-0.5">
                {g.entradas.map((e) => {
                  const esta = activa(e.href, e.prefijo);
                  return (
                    <li key={e.href}>
                      <Link
                        href={e.href}
                        onClick={() => setAbierta(false)}
                        aria-current={esta ? "page" : undefined}
                        title={e.descripcion}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.83rem] font-medium transition ${
                          esta
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        {/* El indicador de página activa es coral: es el único
                            acento de marca que se permite sobre el fondo oscuro. */}
                        {esta && (
                          <span className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-coral" />
                        )}
                        <Icono nombre={e.icono} className={`size-[18px] shrink-0 ${esta ? "text-coral" : ""}`} />
                        {e.etiqueta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Link href="/perfil" className="contents" onClick={() => setAbierta(false)}>
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-coral bg-cover bg-center text-[0.75rem] font-semibold text-white"
                style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
              >
                {!avatarUrl && iniciales(nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.82rem] font-semibold text-white">{nombre}</span>
                <span className="block truncate text-[0.7rem] text-white/45" title={email}>
                  {ROLES[rol].nombre}
                </span>
              </span>
            </Link>
            <CerrarSesion />
          </div>
        </div>
      </aside>
    </>
  );
}
