import Image from "next/image";
import type { Metadata } from "next";
import { hayCredenciales } from "@/lib/supabase/servidor";
import { Icono } from "@/components/ui/Icono";
import { FormularioRecuperacion } from "./FormularioRecuperacion";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarContrasenaPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-deep px-4 py-10">
      <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
        <Image
          src="/marca/logo/avansa-logo.svg"
          alt="avansa"
          width={150}
          height={31}
          priority
          className="h-8 w-auto"
        />
        <p className="mt-7 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-coral">
          Acceso al equipo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Recupera tu contraseña.
        </h1>
        <p className="mt-2 mb-6 text-[0.84rem] leading-relaxed text-slate">
          Te enviaremos un enlace personal para que elijas una contraseña nueva.
        </p>

        {hayCredenciales ? <FormularioRecuperacion /> : <SinCredenciales />}
      </section>
    </main>
  );
}

function SinCredenciales() {
  return (
    <div className="rounded-2xl bg-sand-50 p-5 ring-1 ring-sand-100">
      <p className="flex items-start gap-2 text-[0.82rem] leading-relaxed text-ink">
        <Icono nombre="alerta" className="mt-px size-4 shrink-0 text-sand" />
        El servicio de acceso no está disponible temporalmente. Intenta de nuevo más tarde.
      </p>
    </div>
  );
}
