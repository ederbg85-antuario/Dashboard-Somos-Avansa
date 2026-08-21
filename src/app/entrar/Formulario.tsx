"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { entrar, registrarse, type EstadoAcceso } from "./acciones";

/**
 * Formulario de acceso.
 *
 * Cuando la base todavía no tiene equipo (`hay_equipo() === false`) la
 * pantalla arranca en modo «crear la primera cuenta»: es la instalación del
 * sistema y esa cuenta queda como administradora. En cuanto existe equipo, el
 * alta se cierra y sólo entra quien tiene invitación.
 */
export function Formulario({ instalado, destino }: { instalado: boolean; destino: string }) {
  const [modo, setModo] = useState<"entrar" | "registro">(instalado ? "entrar" : "registro");
  const accion = modo === "entrar" ? entrar : registrarse;
  const [estado, ejecutar] = useActionState<EstadoAcceso, FormData>(accion, {});

  return (
    <form action={ejecutar} className="space-y-4" key={modo}>
      <input type="hidden" name="destino" value={destino} />

      {modo === "registro" && (
        <Campo etiqueta="Nombre completo" name="nombre" autoComplete="name"
               placeholder="Laura Méndez" requerido />
      )}

      <Campo etiqueta="Correo" name="email" type="email" autoComplete="email"
             placeholder="tu@somosavansa.com" requerido />

      <Campo
        etiqueta="Contraseña"
        name="password"
        type="password"
        autoComplete={modo === "entrar" ? "current-password" : "new-password"}
        placeholder="••••••••"
        minLength={modo === "registro" ? 8 : undefined}
        ayuda={modo === "registro" ? "mínimo 8 caracteres" : undefined}
        requerido
      />

      {estado.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[0.8rem] leading-snug text-coral-700">
          <Icono nombre="alerta" className="mt-px size-4 shrink-0" />
          {estado.error}
        </p>
      )}

      {estado.aviso && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2.5 text-[0.8rem] leading-snug text-teal-700">
          <Icono nombre="cheque" className="mt-px size-4 shrink-0" />
          {estado.aviso}
        </p>
      )}

      <Enviar modo={modo} />

      {instalado ? (
        <p className="text-center text-[0.76rem] leading-relaxed text-slate">
          ¿Te invitaron y todavía no tienes cuenta?{" "}
          <button type="button" onClick={() => setModo(modo === "entrar" ? "registro" : "entrar")}
                  className="font-semibold text-coral underline-offset-2 hover:underline">
            {modo === "entrar" ? "Crear mi cuenta" : "Ya tengo cuenta"}
          </button>
        </p>
      ) : (
        <p className="rounded-xl bg-mist px-3 py-2.5 text-center text-[0.76rem] leading-relaxed text-slate">
          Este sistema todavía no tiene equipo. La primera cuenta que se cree
          queda como <strong className="font-semibold text-ink">administradora</strong> y desde
          ahí se invita al resto.
        </p>
      )}
    </form>
  );
}

function Enviar({ modo }: { modo: "entrar" | "registro" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-[0.88rem] font-semibold text-white shadow-tarjeta transition hover:bg-coral-700 disabled:opacity-60"
    >
      {pending
        ? "Un momento…"
        : modo === "entrar" ? "Entrar al sistema" : "Crear cuenta"}
      {!pending && <Icono nombre="chevron" className="size-4" grosor={2.2} />}
    </button>
  );
}
