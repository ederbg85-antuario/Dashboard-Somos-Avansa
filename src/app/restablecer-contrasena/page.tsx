import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/supabase/sesion";
import { FormularioNuevaContrasena } from "./FormularioNuevaContrasena";

export const metadata: Metadata = { title: "Establecer contraseña nueva" };

export default async function RestablecerContrasenaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/entrar?motivo=enlace-invalido");
  if (!sesion.perfil.activo) redirect("/entrar?motivo=inactivo");

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
          Enlace verificado
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Elige una contraseña nueva.
        </h1>
        <p className="mt-2 text-[0.84rem] leading-relaxed text-slate">
          Usa al menos 8 caracteres y evita contraseñas que ya utilices en otros servicios.
        </p>
        <FormularioNuevaContrasena />
      </section>
    </main>
  );
}
