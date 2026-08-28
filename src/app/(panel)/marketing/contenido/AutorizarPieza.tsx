"use client";

import { useState, useTransition } from "react";
import { Icono } from "@/components/ui/Icono";
import { autorizarContenido } from "../acciones";

export function AutorizarPieza({
  contenidoId,
  disponible,
  vencida,
}: {
  contenidoId: string;
  disponible: boolean;
  vencida: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ error: boolean; texto: string } | null>(null);

  const autorizar = () => {
    setMensaje(null);
    iniciar(async () => {
      const resultado = await autorizarContenido(contenidoId);
      setMensaje(resultado.ok
        ? { error: false, texto: resultado.aviso ?? "Pieza autorizada." }
        : { error: true, texto: resultado.error });
    });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={autorizar}
        disabled={!disponible || pendiente}
        className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-deep px-3 py-2 text-[0.72rem] font-semibold text-white shadow-tarjeta transition hover:bg-deep-700 disabled:cursor-not-allowed disabled:bg-hair-fuerte disabled:text-slate"
      >
        <Icono nombre={disponible ? "cheque" : "alerta"} className="size-4" />
        {pendiente
          ? "Verificando…"
          : disponible
            ? vencida ? "Autorizar y publicar ahora" : "Autorizar publicación"
            : "Conexión pendiente"}
      </button>
      {mensaje && (
        <p
          role={mensaje.error ? "alert" : "status"}
          className={`mt-2 rounded-lg px-2.5 py-2 text-[0.7rem] leading-snug ${
            mensaje.error ? "bg-coral-50 text-coral-700" : "bg-teal-50 text-teal-700"
          }`}
        >
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
