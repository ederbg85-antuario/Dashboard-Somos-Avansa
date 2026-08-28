"use client";

import { useEffect, useSyncExternalStore } from "react";

type PreferenciaTema = "system" | "light" | "dark";

const CLAVE_TEMA = "avansa:tema";
const EVENTO_TEMA = "avansa:cambio-tema";

function esPreferenciaTema(valor: string | null): valor is PreferenciaTema {
  return valor === "system" || valor === "light" || valor === "dark";
}

function aplicarTema(preferencia: PreferenciaTema) {
  const oscuro =
    preferencia === "dark"
    || (preferencia === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  document.documentElement.dataset.theme = oscuro ? "dark" : "light";
  document.documentElement.style.colorScheme = oscuro ? "dark" : "light";

  const colorTema = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  colorTema?.setAttribute("content", oscuro ? "#081820" : "#0F2D3D");
}

function leerPreferencia(): PreferenciaTema {
  try {
    const guardada = window.localStorage.getItem(CLAVE_TEMA);
    return esPreferenciaTema(guardada) ? guardada : "system";
  } catch {
    return "system";
  }
}

function suscribirPreferencia(notificar: () => void) {
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
 * Preferencia visual local del usuario. «Sistema» sigue al sistema operativo;
 * claro y oscuro quedan persistidos en este navegador.
 */
export function SelectorTema() {
  const preferencia = useSyncExternalStore<PreferenciaTema>(
    suscribirPreferencia,
    leerPreferencia,
    () => "system",
  );

  useEffect(() => {
    aplicarTema(preferencia);
    if (preferencia !== "system") return;

    const sistema = window.matchMedia("(prefers-color-scheme: dark)");
    const seguirSistema = () => aplicarTema("system");

    sistema.addEventListener("change", seguirSistema);
    return () => sistema.removeEventListener("change", seguirSistema);
  }, [preferencia]);

  const cambiar = (siguiente: PreferenciaTema) => {
    try {
      window.localStorage.setItem(CLAVE_TEMA, siguiente);
    } catch {
      // El tema todavía puede aplicarse durante esta sesión si el navegador
      // bloquea el almacenamiento local.
    }
    aplicarTema(siguiente);
    window.dispatchEvent(new Event(EVENTO_TEMA));
  };

  return (
    <label className="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2 text-white/55 shadow-[inset_0_1px_0_rgb(255_255_255/.04)]">
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
        <path d="M20.2 15.3A8.4 8.4 0 0 1 8.7 3.8 8.5 8.5 0 1 0 20.2 15.3Z" />
      </svg>
      <span className="sr-only">Tema visual</span>
      <select
        value={preferencia}
        onChange={(evento) => cambiar(evento.target.value as PreferenciaTema)}
        aria-label="Tema visual"
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-[0.69rem] font-semibold text-white/75 outline-none"
      >
        <option value="system">Tema del sistema</option>
        <option value="light">Tema claro</option>
        <option value="dark">Tema oscuro</option>
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5 shrink-0"
        aria-hidden="true"
      >
        <path d="m7 9 5 5 5-5" />
      </svg>
    </label>
  );
}
