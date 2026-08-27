import Image from "next/image";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/supabase/sesion";
import { ConfigurarCuenta } from "./ConfigurarCuenta";

export default async function BienvenidaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/entrar");

  return (
    <main className="grid min-h-dvh place-items-center bg-deep px-4 py-10">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
        <Image
          src="/marca/logo/avansa-logo.svg"
          alt="avansa"
          width={150}
          height={31}
          priority
          className="h-8 w-auto"
        />
        <p className="mt-7 text-[.7rem] font-semibold uppercase tracking-[.18em] text-coral">
          Bienvenido al equipo
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Configura tu cuenta.
        </h1>
        <p className="mt-2 text-[.84rem] leading-relaxed text-slate">
          Elige tu contraseña y completa tus datos. Después podrás agregar tu foto de perfil.
        </p>
        <ConfigurarCuenta
          nombreInicial={sesion.perfil.nombre}
          apellidosIniciales={sesion.perfil.apellidos}
        />
      </div>
    </main>
  );
}
