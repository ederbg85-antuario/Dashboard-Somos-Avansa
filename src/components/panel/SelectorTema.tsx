"use client";

import { useEffect, useSyncExternalStore } from "react";

type Tema = "light" | "dark";

const CLAVE_TEMA = "avansa:tema";
const EVENTO_TEMA = "avansa:cambio-tema";
let temaEnSesion: Tema | null = null;

function esTema(valor: string | null): valor is Tema {
  return valor === "light" || valor === "dark";
}

function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema;
  document.documentElement.style.colorScheme = tema;

  const colorTema = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  colorTema?.setAttribute("content", tema === "dark" ? "#081820" : "#0F2D3D");
}

function leerTema(): Tema {
  if (temaEnSesion) return temaEnSesion;
  try {
    const guardada = window.localStorage.getItem(CLAVE_TEMA);
    if (esTema(guardada)) return guardada;
  } catch {
    // La preferencia sigue funcionando durante esta sesión.
  }
  return "light";
}

function suscribirTema(notificar: () => void) {
  const cambioLocal = () => notificar();
  const cambioExterno = (evento: StorageEvent) => {
    if (evento.key === CLAVE_TEMA) notificar();
  };

  window.addEventListener(EVENTO_TEMA, cambioLocal);
  window.addEventListener("storage", cambioExterno);
  return () => {
    window.removeEventListener(EVENTO_TEMA, cambioLocal);
    window.removeEventListener("storage", cambioExterno);
  };
}

/**
 * Alterna el tema visual. Claro es el valor inicial y la elección queda
 * persistida únicamente en este navegador cuando el almacenamiento lo permite.
 */
export function SelectorTema() {
  const tema = useSyncExternalStore<Tema>(
    suscribirTema,
    leerTema,
    () => "light",
  );

  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  const cambiar = () => {
    const siguiente: Tema = tema === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(CLAVE_TEMA, siguiente);
      temaEnSesion = null;
    } catch {
      // El tema todavía se conserva durante esta sesión.
      temaEnSesion = siguiente;
    }
    aplicarTema(siguiente);
    window.dispatchEvent(new Event(EVENTO_TEMA));
  };

  const accion = tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  return (
    <button
      type="button"
      onClick={cambiar}
      className="selector-tema flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left shadow-[inset_0_1px_0_rgb(255_255_255/.04)] transition"
      aria-label={accion}
      title={accion}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0"
        aria-hidden="true"
      >
        {tema === "dark" ? (
          <>
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2.5V5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
          </>
        ) : (
          <path d="M20.2 15.3A8.4 8.4 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
        )}
      </svg>
      <span className="selector-tema__etiqueta min-w-0 flex-1 text-[0.69rem] font-semibold">
        {tema === "dark" ? "Tema claro" : "Tema oscuro"}
      </span>
    </button>
  );
}
