"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Icono } from "@/components/ui/Icono";
import { ROLES } from "@/lib/constantes";
import { iniciales } from "@/lib/formato";
import type { RolUsuario } from "@/lib/supabase/tipos";
import { CerrarSesion } from "./CerrarSesion";
import { SelectorTema } from "./SelectorTema";
import type { Grupo } from "./navegacion";

type PreferenciaNavegacion = "amplia" | "compacta";

const CLAVE_NAVEGACION = "avansa:navegacion:v1";
const EVENTO_NAVEGACION = "avansa:cambio-navegacion";
const CONSULTA_ESCRITORIO = "(min-width: 64rem)";
let preferenciaEnSesion: PreferenciaNavegacion | null = null;

function leerPreferenciaNavegacion(): PreferenciaNavegacion {
  if (preferenciaEnSesion) return preferenciaEnSesion;
  try {
    const guardada = window.localStorage.getItem(CLAVE_NAVEGACION);
    if (guardada === "amplia" || guardada === "compacta") return guardada;
  } catch {
    // La preferencia sigue funcionando durante esta sesión.
  }
  return "amplia";
}

function suscribirNavegacion(notificar: () => void) {
  const cambioLocal = () => notificar();
  const cambioExterno = (evento: StorageEvent) => {
    if (evento.key === CLAVE_NAVEGACION) notificar();
  };

  window.addEventListener(EVENTO_NAVEGACION, cambioLocal);
  window.addEventListener("storage", cambioExterno);
  return () => {
    window.removeEventListener(EVENTO_NAVEGACION, cambioLocal);
    window.removeEventListener("storage", cambioExterno);
  };
}

function aplicarNavegacion(preferencia: PreferenciaNavegacion) {
  document.documentElement.dataset.navegacion = preferencia;
}

function suscribirEscritorio(notificar: () => void) {
  const consulta = window.matchMedia(CONSULTA_ESCRITORIO);
  consulta.addEventListener("change", notificar);
  return () => consulta.removeEventListener("change", notificar);
}

const leerEscritorio = () => window.matchMedia(CONSULTA_ESCRITORIO).matches;

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
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [submenus, setSubmenus] = useState<Record<string, boolean>>({});
  const preferenciaNavegacion = useSyncExternalStore<PreferenciaNavegacion>(
    suscribirNavegacion,
    leerPreferenciaNavegacion,
    () => "amplia",
  );
  const compacta = preferenciaNavegacion === "compacta";
  const esEscritorio = useSyncExternalStore(suscribirEscritorio, leerEscritorio, () => false);
  const compactaVisual = compacta && esEscritorio;

  useEffect(() => {
    aplicarNavegacion(preferenciaNavegacion);
  }, [preferenciaNavegacion]);

  function cambiarAncho() {
    const siguiente: PreferenciaNavegacion = compacta ? "amplia" : "compacta";
    try {
      window.localStorage.setItem(CLAVE_NAVEGACION, siguiente);
      preferenciaEnSesion = null;
    } catch {
      // No se necesita almacenamiento para conservar el cambio en esta pestaña.
      preferenciaEnSesion = siguiente;
    }
    aplicarNavegacion(siguiente);
    window.dispatchEvent(new Event(EVENTO_NAVEGACION));
  }

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
        className={`barra-avansa barra-lateral-panel fixed inset-y-3 left-3 z-40 flex w-[calc(100vw-1.5rem)] max-w-[278px] flex-col overflow-hidden rounded-[1.75rem] transition-[width,transform] duration-300 lg:translate-x-0 ${
          abierta ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
        }`}
      >
        <div className="barra-lateral__cabecera relative flex h-[4.6rem] shrink-0 items-center justify-between gap-2 px-5">
          <Link
            href="/"
            onClick={() => setAbierta(false)}
            className="barra-lateral__marca flex min-w-0 items-center"
            aria-label="Ir al inicio"
            title="Inicio"
          >
            <Image
              src="/marca/logo/avansa-logo-on-dark.svg"
              alt="avansa · inicio"
              width={130}
              height={27}
              priority
              className="barra-lateral__logo h-[26px] w-auto"
            />
            <Image
              src="/marca/isotipo/avansa-isotipo-white.svg"
              alt=""
              width={30}
              height={30}
              className="barra-lateral__isotipo hidden size-[30px]"
            />
          </Link>
          <button
            type="button"
            onClick={cambiarAncho}
            className="barra-lateral__colapsar hidden size-8 shrink-0 place-items-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white lg:grid"
            aria-label={compacta ? "Ampliar navegación" : "Compactar navegación"}
            aria-pressed={compacta}
            title={compacta ? "Ampliar navegación" : "Compactar navegación"}
          >
            <Icono nombre="chevron" className={`size-4 transition-transform ${compacta ? "" : "rotate-180"}`} />
          </button>
          <button
            type="button"
            onClick={() => setAbierta(false)}
            className="grid size-8 place-items-center rounded-xl text-white/55 transition hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <Icono nombre="cruz" className="size-4" />
          </button>
        </div>

        <div className="barra-lateral__distintivo relative px-4 pb-4">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-white/60 shadow-tarjeta">
            <span className="size-1.5 rounded-full bg-coral" aria-hidden="true" />
            Sistema integral
          </p>
        </div>

        <nav className="scroll-oscuro relative min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Secciones del sistema">
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="barra-lateral__seccion mb-5 last:mb-0">
              <p className="barra-lateral__grupo mb-1.5 px-3 text-[0.63rem] font-semibold uppercase tracking-[0.15em] text-white/50">
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
                          onClick={() => {
                            if (compactaVisual) {
                              router.push(entrada.href);
                              setAbierta(false);
                              return;
                            }
                            setSubmenus((actuales) => ({
                              ...actuales,
                              [entrada.href]: !(actuales[entrada.href] ?? esta),
                            }));
                          }}
                          aria-expanded={compactaVisual ? undefined : submenuAbierto}
                          aria-controls={compactaVisual ? undefined : idSubmenu}
                          aria-label={compactaVisual ? entrada.etiqueta : undefined}
                          title={entrada.descripcion}
                          className={`barra-lateral__enlace group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[0.83rem] font-medium transition ${
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
                          <span className="barra-lateral__texto min-w-0 flex-1">{entrada.etiqueta}</span>
                          <Icono
                            nombre="chevron"
                            className={`barra-lateral__flecha size-4 shrink-0 text-white/30 transition-transform duration-300 ${
                              submenuAbierto ? "rotate-90" : ""
                            }`}
                          />
                        </button>

                        {submenuAbierto && !compactaVisual ? (
                          <ul id={idSubmenu} className="barra-lateral__submenu animate-entrar space-y-0.5 pb-1 pl-5 pt-1">
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
                        aria-label={compactaVisual ? entrada.etiqueta : undefined}
                        title={entrada.descripcion}
                        className={`barra-lateral__enlace group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.83rem] font-medium transition ${
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
                        <span className="barra-lateral__texto">{entrada.etiqueta}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="barra-lateral__pie relative shrink-0 p-3">
          <SelectorTema />
          <div className="barra-lateral__perfil mt-2 flex items-center gap-2 rounded-2xl bg-white/[0.07] p-2 shadow-[inset_0_1px_0_rgb(255_255_255/.05),0_12px_28px_-18px_rgb(0_0_0/.8)] backdrop-blur-sm">
            <Link
              href="/perfil"
              className="barra-lateral__usuario flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition hover:bg-white/[0.07]"
              onClick={() => setAbierta(false)}
              title={`${nombre} · ${ROLES[rol].nombre}`}
              aria-label={`Abrir perfil de ${nombre}`}
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-coral bg-cover bg-center text-[0.75rem] font-semibold text-white shadow-tarjeta"
                style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
              >
                {!avatarUrl && iniciales(nombre)}
              </span>
              <span className="barra-lateral__texto min-w-0 flex-1">
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
