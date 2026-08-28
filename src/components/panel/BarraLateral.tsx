"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { ROLES } from "@/lib/constantes";
import { iniciales } from "@/lib/formato";
import type { RolUsuario } from "@/lib/supabase/tipos";
import { CerrarSesion } from "./CerrarSesion";
import { SelectorTema } from "./SelectorTema";
import type { Grupo } from "./navegacion";

/**
 * Navegación principal del sistema.
 *
 * En escritorio vive dentro de una superficie flotante. En móvil conserva
 * esa misma superficie y se comporta como un cajón para no quitar espacio de
 * trabajo al contenido.
 */
export function BarraLateral({
  grupos,
  nombre,
  email,
  rol,
  avatarUrl,
}: {
  grupos: Grupo[];
  nombre: string;
  email: string;
  rol: RolUsuario;
  avatarUrl: string | null;
}) {
  const ruta = usePathname();
  const [abierta, setAbierta] = useState(false);
  const [submenus, setSubmenus] = useState<Record<string, boolean>>({});

  const activa = (href: string, prefijo?: boolean) =>
    href === "/" ? ruta === "/" : prefijo ? ruta.startsWith(href) : ruta === href;

  return (
    <>
      <div className="sticky top-0 z-30 px-3 pt-3 lg:hidden">
        <div className="barra-avansa flex h-14 items-center justify-between gap-3 rounded-2xl px-4 shadow-elevada backdrop-blur-xl">
          <Link href="/" className="flex items-center">
            <Image
              src="/marca/logo/avansa-logo-on-dark.svg"
              alt="avansa"
              width={116}
              height={24}
              priority
              className="h-6 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={() => setAbierta((valor) => !valor)}
            className="grid size-9 place-items-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label={abierta ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={abierta}
            aria-controls="navegacion-principal"
          >
            <Icono nombre={abierta ? "cruz" : "menu"} />
          </button>
        </div>
      </div>

      {abierta ? (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setAbierta(false)}
          className="fixed inset-0 z-30 bg-deep-900/35 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}

      <aside
        id="navegacion-principal"
        aria-label="Navegación principal"
        className={`barra-avansa fixed inset-y-3 left-3 z-40 flex w-[calc(100vw-1.5rem)] max-w-[278px] flex-col overflow-hidden rounded-[1.75rem] transition-transform duration-300 lg:w-[268px] lg:translate-x-0 ${
          abierta ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
        }`}
      >
        <div className="relative flex h-[4.6rem] shrink-0 items-center justify-between gap-2 px-5">
          <Link href="/" onClick={() => setAbierta(false)} className="flex items-center">
            <Image
              src="/marca/logo/avansa-logo-on-dark.svg"
              alt="avansa · inicio"
              width={130}
              height={27}
              priority
              className="h-[26px] w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="grid size-8 place-items-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <Icono nombre="cruz" className="size-4" />
          </button>
        </div>

        <div className="relative px-4 pb-4">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/60 shadow-tarjeta">
            <span className="size-1.5 rounded-full bg-coral" aria-hidden="true" />
            Sistema integral
          </p>
        </div>

        <nav className="scroll-oscuro relative min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones del sistema">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-3 text-[0.63rem] font-semibold uppercase tracking-[0.15em] text-white/50">
                {grupo.titulo}
              </p>
              <ul className="space-y-0.5">
                {grupo.entradas.map((entrada) => {
                  const esta = entrada.subentradas
                    ? entrada.subentradas.some((subentrada) => activa(subentrada.href, subentrada.prefijo))
                    : activa(entrada.href, entrada.prefijo);
                  const submenuAbierto = submenus[entrada.href] ?? esta;

                  if (entrada.subentradas) {
                    const idSubmenu = `submenu-${entrada.href.replaceAll("/", "-").replace(/^-/, "")}`;

                    return (
                      <li key={entrada.href}>
                        <button
                          type="button"
                          onClick={() =>
                            setSubmenus((actuales) => ({
                              ...actuales,
                              [entrada.href]: !(actuales[entrada.href] ?? esta),
                            }))
                          }
                          aria-expanded={submenuAbierto}
                          aria-controls={idSubmenu}
                          title={entrada.descripcion}
                          className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.83rem] font-medium transition ${
                            esta
                              ? "bg-white/[0.11] text-white shadow-[0_8px_22px_-14px_rgb(0_0_0/.7),inset_0_1px_0_rgb(255_255_255/.06)]"
                              : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                          }`}
                        >
                          <Icono
                            nombre={entrada.icono}
                            className={`size-[18px] shrink-0 ${
                              esta ? "text-coral" : "text-white/35 group-hover:text-coral"
                            }`}
                          />
                          <span className="min-w-0 flex-1">{entrada.etiqueta}</span>
                          <Icono
                            nombre="chevron"
                            className={`size-4 shrink-0 text-white/30 transition-transform duration-300 ${
                              submenuAbierto ? "rotate-90" : ""
                            }`}
                          />
                        </button>

                        {submenuAbierto ? (
                          <ul id={idSubmenu} className="animate-entrar space-y-0.5 pb-1 pl-5 pt-1">
                            {entrada.subentradas.map((subentrada) => {
                              const subentradaActiva = activa(subentrada.href, subentrada.prefijo);

                              return (
                                <li key={subentrada.href}>
                                  <Link
                                    href={subentrada.href}
                                    onClick={() => setAbierta(false)}
                                    aria-current={subentradaActiva ? "page" : undefined}
                                    title={subentrada.descripcion}
                                    className={`group/sub flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.75rem] font-medium transition ${
                                      subentradaActiva
                                        ? "bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgb(255_255_255/.05)]"
                                        : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                                    }`}
                                  >
                                    <span
                                      className={`size-1.5 shrink-0 rounded-full transition ${
                                        subentradaActiva
                                          ? "bg-coral"
                                          : "bg-white/25 group-hover/sub:bg-coral/70"
                                      }`}
                                      aria-hidden="true"
                                    />
                                    {subentrada.etiqueta}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </li>
                    );
                  }

                  return (
                    <li key={entrada.href}>
                      <Link
                        href={entrada.href}
                        onClick={() => setAbierta(false)}
                        aria-current={esta ? "page" : undefined}
                        title={entrada.descripcion}
                        className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.83rem] font-medium transition ${
                          esta
                            ? "bg-white/[0.11] text-white shadow-[0_8px_22px_-14px_rgb(0_0_0/.7),inset_0_1px_0_rgb(255_255_255/.06)]"
                            : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <Icono
                          nombre={entrada.icono}
                          className={`size-[18px] shrink-0 ${
                            esta ? "text-coral" : "text-white/35 group-hover:text-coral"
                          }`}
                        />
                        {entrada.etiqueta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="relative shrink-0 p-3">
          <SelectorTema />
          <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/[0.07] p-2 shadow-[inset_0_1px_0_rgb(255_255_255/.05),0_12px_28px_-18px_rgb(0_0_0/.8)] backdrop-blur-sm">
            <Link
              href="/perfil"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-white/[0.07]"
              onClick={() => setAbierta(false)}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-coral bg-cover bg-center text-[0.75rem] font-semibold text-white shadow-tarjeta"
                style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
              >
                {!avatarUrl && iniciales(nombre)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.82rem] font-semibold text-white">{nombre}</span>
                <span className="block truncate text-[0.7rem] text-white/60" title={email}>
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
