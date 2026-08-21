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
        <Tarjeta>
          <CabezaTarjeta
            titulo="Nuevo expediente"
            apoyo="Para el contacto que no llegó por el formulario del sitio: una llamada, un WhatsApp directo o una recomendación. Entra al pipeline en «Contactado» y asignado a ti."
          />
          <div className="mt-5">
            <FormularioAlta />
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
