import Link from "next/link";
import type { Metadata } from "next";
import { Tarjeta, CabezaTarjeta } from "@/components/ui/Tarjeta";
import { Icono } from "@/components/ui/Icono";
import { exigirSesion } from "@/lib/supabase/sesion";
import { FormularioAlta } from "./Formulario";

export const metadata: Metadata = { title: "Alta manual" };

export default async function AltaManual() {
  await exigirSesion();

  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-[0.78rem] text-slate">
        <Link href="/crm" className="inline-flex items-center gap-1 font-semibold hover:text-coral">
          <Icono nombre="volver" className="size-3.5" />
          Pipeline
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink">Alta manual</span>
      </div>

      <div className="mx-auto max-w-3xl">
        <Tarjeta className="animate-entrar !ring-0 shadow-flotante">
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-coral-50 to-teal-50 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-coral text-white shadow-elevada">
              <Icono nombre="mas" className="size-5" />
            </span>
            <CabezaTarjeta
              className="min-w-0 flex-1"
              titulo="Nuevo expediente"
              apoyo="Registra un contacto recibido por llamada, WhatsApp o recomendación. Se agregará en la etapa «Contactado» y quedará asignado a tu perfil."
            />
          </div>
          <div className="mt-5">
            <FormularioAlta />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
