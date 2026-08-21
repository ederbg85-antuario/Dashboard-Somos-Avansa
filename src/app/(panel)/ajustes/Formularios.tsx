"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Campo, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { NATURALEZAS } from "@/lib/constantes";
import { inicioDeMes } from "@/lib/formato";
import { guardarCategoria, guardarMeta, type Resultado } from "../finanzas/acciones";
import { borrarDatosDemo } from "./acciones";

const inicial: Resultado = { ok: true };

export function NuevaCategoria() {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => guardarCategoria(fd),
    inicial,
  );

  return (
    <form action={ejecutar} className="space-y-3">
      <Campo etiqueta="Nombre" name="nombre" requerido placeholder="Comisiones de referidos" />
      <CampoSelect etiqueta="¿En qué renglón cae?" name="naturaleza" requerido defaultValue="gasto_operativo"
                   ayuda="define cómo afecta los márgenes">
        {(Object.keys(NATURALEZAS) as (keyof typeof NATURALEZAS)[]).map((n) => (
          <option key={n} value={n}>{NATURALEZAS[n].nombre}</option>
        ))}
      </CampoSelect>
      <CampoTexto etiqueta="Descripción" name="descripcion" filas={2}
                  placeholder="Para qué se usa esta cuenta." />
      <Campo etiqueta="Color" name="color" type="color" defaultValue="#6B7785" className="max-w-[8rem]" />
      <Aviso estado={estado} />
      <Enviar>Crear categoría</Enviar>
    </form>
  );
}

export function MetaDelMes({
  actual,
}: {
  actual: { periodo: string; ingresos_meta: number; leads_meta: number; cierres_meta: number; cpl_meta: number | null } | null;
}) {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => guardarMeta(fd),
    inicial,
  );

  return (
    <form action={ejecutar} className="space-y-3">
      <Campo etiqueta="Mes" name="periodo" type="month" requerido
             defaultValue={(actual?.periodo ?? inicioDeMes()).slice(0, 7)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoMonto etiqueta="Ingresos objetivo" name="ingresos_meta"
                    defaultValue={actual?.ingresos_meta ?? ""} placeholder="0.00" />
        <CampoMonto etiqueta="Costo por lead objetivo" name="cpl_meta"
                    defaultValue={actual?.cpl_meta ?? ""} placeholder="0.00" />
        <Campo etiqueta="Solicitudes objetivo" name="leads_meta" type="number" min={0}
               defaultValue={actual?.leads_meta ?? 0} />
        <Campo etiqueta="Cierres objetivo" name="cierres_meta" type="number" min={0}
               defaultValue={actual?.cierres_meta ?? 0} />
      </div>
      <Aviso estado={estado} />
      <Enviar tono="oscuro">Guardar meta</Enviar>
    </form>
  );
}

/**
 * Borrado de los datos de demostración.
 *
 * Pide escribir la palabra a mano en vez de un `confirm()`: es una acción
 * irreversible y un diálogo del navegador se acepta por reflejo.
 */
export function BorrarDemo({ cuantos }: { cuantos: number }) {
  const router = useRouter();
  const [palabra, setPalabra] = useState("");
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado) => {
      const r = await borrarDatosDemo();
      if (r.ok) { setPalabra(""); router.refresh(); }
      return r;
    },
    inicial,
  );

  if (cuantos === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-teal-50 px-3.5 py-3 text-[0.8rem] text-teal-700">
        <Icono nombre="cheque" className="size-4 shrink-0" />
        No queda ningún dato de demostración. El sistema está listo para operar.
      </p>
    );
  }

  return (
    <form action={ejecutar} className="space-y-3">
      <p className="rounded-xl bg-sand-50 px-3.5 py-3 text-[0.8rem] leading-relaxed text-ink">
        Hay <strong className="font-semibold">{cuantos} expedientes de demostración</strong> (más sus
        campañas, métricas y movimientos). Sirven para recorrer el sistema con
        contenido; bórralos antes de operar de verdad. Sólo se elimina lo
        marcado como demostración: lo que capture el equipo no se toca.
      </p>

      <Campo
        etiqueta="Escribe BORRAR para confirmar"
        name="confirmacion"
        value={palabra}
        onChange={(e) => setPalabra(e.target.value.toUpperCase())}
        placeholder="BORRAR"
        autoComplete="off"
      />

      <Aviso estado={estado} />
      <BotonBorrar habilitado={palabra === "BORRAR"} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

function BotonBorrar({ habilitado }: { habilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono="peligro" disabled={!habilitado || pending}>
      <Icono nombre="basura" className="size-4" />
      {pending ? "Borrando…" : "Borrar los datos de demostración"}
    </Boton>
  );
}

function Enviar({ children, tono = "coral" }: { children: React.ReactNode; tono?: "coral" | "oscuro" }) {
  const { pending } = useFormStatus();
  return <Boton type="submit" tono={tono} disabled={pending}>{pending ? "Guardando…" : children}</Boton>;
}

function Aviso({ estado }: { estado: Resultado }) {
  if (estado.ok && !estado.aviso) return null;
  const malo = !estado.ok;
  return (
    <p role={malo ? "alert" : "status"}
       className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[0.78rem] leading-snug ${
         malo ? "bg-coral-50 text-coral-700" : "bg-teal-50 text-teal-700"}`}>
      <Icono nombre={malo ? "alerta" : "cheque"} className="mt-px size-4 shrink-0" />
      {malo ? estado.error : estado.aviso}
    </p>
  );
}
