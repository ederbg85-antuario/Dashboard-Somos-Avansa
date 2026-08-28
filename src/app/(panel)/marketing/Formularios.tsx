"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Campo, CampoMonto, CampoSelect } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { OBJETIVOS_META } from "@/lib/constantes";
import { haceDias } from "@/lib/formato";
import type { Campana } from "@/lib/supabase/tipos";
import { guardarCampana, guardarMetrica, sincronizarConMeta, type Resultado } from "./acciones";

const inicial: Resultado = { ok: true };

export function NuevaCampana() {
  const [abierto, setAbierto] = useState(false);
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => {
      const r = await guardarCampana(fd);
      if (r.ok) setAbierto(false);
      return r;
    },
    inicial,
  );

  if (!abierto) {
    return (
      <Boton type="button" tono="coral" onClick={() => setAbierto(true)}>
        <Icono nombre="mas" className="size-4" />
        Nueva campaña
      </Boton>
    );
  }

  return (
    <form action={ejecutar} className="w-full space-y-3 rounded-2xl bg-white p-5 shadow-elevada">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.9rem] font-semibold text-ink">Nueva campaña</h3>
        <button type="button" onClick={() => setAbierto(false)}
                className="grid size-7 place-items-center rounded-lg text-slate hover:bg-mist hover:text-ink"
                aria-label="Cerrar">
          <Icono nombre="cruz" className="size-4" />
        </button>
      </div>

      <Campo etiqueta="Nombre de la campaña" name="nombre" requerido
             placeholder="Mejoravit · Tráfico CDMX-EdoMex" />

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="Objetivo" name="objetivo" defaultValue="Tráfico">
          {OBJETIVOS_META.map((o) => <option key={o} value={o}>{o}</option>)}
        </CampoSelect>
        <CampoSelect etiqueta="Estado" name="estado" defaultValue="borrador">
          <option value="borrador">Borrador</option>
          <option value="pausada">Pausada</option>
        </CampoSelect>
      </div>

      <Campo etiqueta="Público" name="publico"
             placeholder="Derechohabientes 28-55, CDMX y Estado de México" />

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Inicio" name="fecha_inicio" type="date" ayuda="deja vacío hasta confirmar" />
        <Campo etiqueta="Fin" name="fecha_fin" type="date" ayuda="deja vacío hasta confirmar" />
        <CampoMonto etiqueta="Presupuesto diario" name="presupuesto_diario" placeholder="0.00" ayuda="no activa gasto" />
      </div>

      <Campo etiqueta="Identificador en Meta" name="meta_campaign_id"
             ayuda="opcional, sólo para lectura" placeholder="120210000000001" />

      <p className="rounded-xl bg-sand-50 px-3 py-2.5 text-[0.74rem] leading-snug text-ink">
        Guardar aquí no crea anuncios ni activa presupuesto. Las fechas se completan sólo después de que el usuario confirme inicio y término.
      </p>

      <Aviso estado={estado} />
      <Enviar>Guardar sin activar</Enviar>
    </form>
  );
}

/** Captura del desempeño de un día. Reescribir el mismo día corrige el dato. */
export function CapturaMetrica({ campanas }: { campanas: Campana[] }) {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => guardarMetrica(fd),
    inicial,
  );

  if (campanas.length === 0) {
    return (
      <p className="rounded-xl bg-mist px-3.5 py-3 text-[0.8rem] leading-relaxed text-slate">
        Primero da de alta una campaña; después podrás capturar su desempeño diario aquí.
      </p>
    );
  }

  return (
    <form action={ejecutar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <CampoSelect etiqueta="Campaña" name="campana_id" requerido>
          {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </CampoSelect>
        <Campo etiqueta="Día" name="fecha" type="date" requerido defaultValue={haceDias(1)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Campo etiqueta="Impresiones" name="impresiones" type="number" min={0} defaultValue={0} />
        <Campo etiqueta="Alcance" name="alcance" type="number" min={0} defaultValue={0} />
        <Campo etiqueta="Clics" name="clics" type="number" min={0} defaultValue={0} />
        <CampoMonto etiqueta="Gasto" name="gasto" defaultValue={0} />
        <Campo etiqueta="Leads" name="leads" type="number" min={0} defaultValue={0} />
        <Campo etiqueta="Conversaciones" name="conversaciones" type="number" min={0} defaultValue={0} />
      </div>

      <Aviso estado={estado} />
      <Enviar tono="oscuro">Guardar el día</Enviar>
    </form>
  );
}

/** Trae de Meta el desempeño de los últimos días. */
export function BotonSincronizar({ configurado }: { configurado: boolean }) {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => sincronizarConMeta(Number(fd.get("dias")) || 30),
    inicial,
  );

  return (
    <form action={ejecutar} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select name="dias" defaultValue="30" aria-label="Días a sincronizar"
                className="h-10 cursor-pointer rounded-xl bg-white px-3 text-[0.82rem] text-ink ring-1 ring-hair focus:outline-none focus:ring-2 focus:ring-coral">
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
        <Sincronizar configurado={configurado} />
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/* ------------------------------------------------------------------ */

function Sincronizar({ configurado }: { configurado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono={configurado ? "coral" : "claro"} disabled={pending || !configurado}
           title={configurado ? undefined : "La conexión de lectura está pendiente"}>
      <Icono nombre="destello" className={`size-4 ${pending ? "animate-latir" : ""}`} />
      {pending ? "Actualizando…" : "Actualizar datos"}
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
