"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { entrar, type EstadoAcceso } from "./acciones";

export function Formulario({ destino }: { destino: string }) {
  const [estado, ejecutar] = useActionState<EstadoAcceso, FormData>(entrar, {});

  return (
    <form action={ejecutar} className="space-y-4">
      <input type="hidden" name="destino" value={destino} />
      <Campo etiqueta="Correo" name="email" type="email" autoComplete="email"
             placeholder="tu@somosavansa.com" requerido />
      <Campo etiqueta="Contraseña" name="password" type="password"
             autoComplete="current-password" placeholder="••••••••" requerido />

      {estado.error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[0.8rem] leading-snug text-coral-700">
          <Icono nombre="alerta" className="mt-px size-4 shrink-0" />
          {estado.error}
        </p>
      )}
      <Enviar />
      <p className="text-center text-[0.76rem] leading-relaxed text-slate">
        Acceso disponible únicamente mediante invitación de avansa.
      </p>
    </form>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-[0.88rem] font-semibold text-white shadow-tarjeta transition hover:bg-coral-700 disabled:opacity-60"
    >
      {pending ? "Un momento…" : "Entrar al sistema"}
      {!pending && <Icono nombre="chevron" className="size-4" grosor={2.2} />}
    </button>
  );
}
