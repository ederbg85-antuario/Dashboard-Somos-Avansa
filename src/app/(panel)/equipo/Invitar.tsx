"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo, CampoSelect } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { ROLES } from "@/lib/constantes";
import { invitar, type Resultado } from "./acciones";

export function Invitar() {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => invitar(fd),
    { ok: true } as Resultado,
  );

  return (
    <form action={ejecutar} className="space-y-3">
      <Campo etiqueta="Correo" name="email" type="email" requerido
             placeholder="asesor@somosavansa.com" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" placeholder="Rene" requerido />
        <Campo etiqueta="Apellidos" name="apellidos" placeholder="Avendaño" requerido />
      </div>
      <CampoSelect etiqueta="Rol" name="rol" defaultValue="asesor">
        {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => (
          <option key={r} value={r}>{ROLES[r].nombre} — {ROLES[r].descripcion}</option>
        ))}
      </CampoSelect>

      {!estado.ok && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-coral-50 px-3 py-2 text-[0.78rem] text-coral-700">
          <Icono nombre="alerta" className="size-4 shrink-0" />{estado.error}
        </p>
      )}
      {estado.ok && estado.aviso && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-teal-50 px-3 py-2 text-[0.78rem] leading-snug text-teal-700">
          <Icono nombre="cheque" className="mt-px size-4 shrink-0" />{estado.aviso}
        </p>
      )}

      <Enviar />
    </form>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono="coral" disabled={pending} className="w-full">
      {pending ? "Enviando…" : "Enviar invitación"}
    </Boton>
  );
}
