import Image from "next/image";
import type { Metadata } from "next";
import { hayCredenciales } from "@/lib/supabase/servidor";
import { DISCLAIMER } from "@/lib/constantes";
import { Icono } from "@/components/ui/Icono";
import { Formulario } from "./Formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; motivo?: string }>;
}) {
  const { destino = "/", motivo } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,29rem)]">
      {/* Panel de marca. En móvil se reduce a la cabecera del formulario. */}
      <aside className="relative hidden overflow-hidden bg-deep p-12 lg:flex lg:flex-col lg:justify-between">
        <Mancha />
        <Image src="/marca/logo/avansa-logo-on-dark.svg" alt="avansa"
               width={150} height={31} priority className="relative h-8 w-auto" />

        <div className="relative max-w-md">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-coral">
            Sistema integral
          </p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-[1.15] tracking-tight text-white">
            Todo el negocio en una sola pantalla.
          </h1>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-white/60">
            Las solicitudes del sitio, el pipeline de expedientes, la pauta de
            Meta y el estado de resultados. Conectados, no en cuatro hojas de
            cálculo distintas.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              ["bandeja", "Las solicitudes del sitio entran solas"],
              ["embudo", "Pipeline de A, B, C y D con expediente"],
              ["megafono", "Costo por lead real de cada campaña"],
              ["monedas", "Margen bruto, EBITDA y utilidad neta"],
            ].map(([icono, texto]) => (
              <li key={texto} className="flex items-center gap-3 text-[0.85rem] text-white/75">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-coral">
                  <Icono nombre={icono as "bandeja"} className="size-4" />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative max-w-md text-[0.68rem] leading-relaxed text-white/45">{DISCLAIMER}</p>
      </aside>

      <section className="flex flex-col justify-center bg-paper px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Image src="/marca/logo/avansa-logo.svg" alt="avansa"
                 width={140} height={29} priority className="h-7 w-auto lg:hidden" />

          <h2 className="mt-8 text-[1.35rem] font-semibold tracking-tight text-ink lg:mt-0">
            Entra al sistema
          </h2>
          <p className="mt-1.5 mb-7 text-[0.84rem] leading-relaxed text-slate">
            Acceso exclusivo del equipo de avansa.
          </p>

          {!hayCredenciales ? (
            <SinCredenciales />
          ) : (
            <>
              {motivo === "inactivo" && (
                <p role="alert" className="mb-4 rounded-xl bg-sand-50 px-3 py-2.5 text-[0.8rem] leading-snug text-ink">
                  Tu cuenta está dada de baja. Pídele a un administrador que la reactive.
                </p>
              )}
              {motivo === "enlace-invalido" && (
                <p role="alert" className="mb-4 rounded-xl bg-coral-50 px-3 py-2.5 text-[0.8rem] leading-snug text-coral-700">
                  El enlace venció o ya fue usado. Solicita uno nuevo e inténtalo otra vez.
                </p>
              )}
              <Formulario destino={destino} />
            </>
          )}

          <p className="mt-10 flex items-center justify-center gap-1.5 text-[0.7rem] text-slate-400">
            <Icono nombre="candado" className="size-3.5" />
            Datos personales protegidos. Acceso por rol.
          </p>
        </div>
      </section>
    </main>
  );
}

/** Aviso honesto cuando falta la conexión principal, en vez de un error opaco. */
function SinCredenciales() {
  return (
    <div className="rounded-2xl bg-sand-50 p-5 ring-1 ring-sand-100">
      <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
        <Icono nombre="alerta" className="size-4 text-sand" />
        Servicio temporalmente no disponible
      </h3>
      <p className="mt-2 text-[0.8rem] leading-relaxed text-slate">
        El acceso seguro no está conectado en este entorno. Pide a administración que revise la conexión e intenta de nuevo.
      </p>
    </div>
  );
}

/**
 * La mancha de marca del sitio público, traída al panel. Dos siluetas que
 * giran en sentidos opuestos y a ritmos que no son múltiplos entre sí: el
 * contorno del conjunto nunca se repite.
 */
function Mancha() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg viewBox="0 0 200 200" className="absolute -right-32 -top-40 size-[42rem] opacity-[0.10] animate-[girar_38s_linear_infinite]">
        <path fill="#FF4D6D" d="M46.6 -60.2C58.5 -50.8 65 -34.6 68.5 -18.2C72 -1.8 72.6 15 66.3 28.6C60 42.2 46.9 52.6 32.6 60.2C18.3 67.8 2.9 72.6 -12.9 71.2C-28.7 69.8 -44.8 62.2 -55.9 50.1C-67 38 -73 21.4 -73.7 4.6C-74.4 -12.2 -69.8 -29.2 -59.4 -41.2C-49 -53.2 -32.8 -60.2 -17.3 -63.6C-1.8 -67 13 -66.8 27.9 -69.6Z" transform="translate(100 100)" />
      </svg>
      <svg viewBox="0 0 200 200" className="absolute -bottom-48 -left-32 size-[36rem] opacity-[0.07]">
        <path fill="#2FB6A3" d="M38.9 -52.4C52.1 -44.8 66.1 -36.3 71.6 -23.8C77.1 -11.3 74.1 5.2 68 20.1C61.9 35 52.7 48.3 40.1 56.9C27.5 65.5 11.5 69.4 -4.6 68.6C-20.7 67.8 -36.9 62.3 -48.9 52C-60.9 41.7 -68.7 26.6 -71.4 10.4C-74.1 -5.8 -71.7 -23.1 -63.2 -36.2C-54.7 -49.3 -40.1 -58.2 -25.6 -64.6C-11.1 -71 3.3 -74.9 16.4 -71.5C29.5 -68.1 41.3 -57.4 38.9 -52.4Z" transform="translate(100 100)" />
      </svg>
    </div>
  );
}
