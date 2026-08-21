"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icono } from "@/components/ui/Icono";
import { clienteNavegador } from "@/lib/supabase/navegador";

/**
 * Cierra sesión en el navegador y refresca.
 *
 * Va del lado del cliente a propósito: `signOut()` tiene que limpiar también
 * el almacenamiento local de supabase-js, no sólo la cookie. Después
 * `refresh()` deja que el middleware haga la redirección.
 */
export function CerrarSesion() {
  const router = useRouter();
  const [saliendo, empezar] = useTransition();

  return (
    <button
      type="button"
      disabled={saliendo}
      onClick={() =>
        empezar(async () => {
          await clienteNavegador().auth.signOut();
          router.replace("/entrar");
          router.refresh();
        })
      }
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
    >
      <Icono nombre="salir" className={`size-[18px] ${saliendo ? "animate-latir" : ""}`} />
    </button>
  );
}
