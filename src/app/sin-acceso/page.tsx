import type { Metadata } from "next";
import { BotonEnlace } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { ROLES } from "@/lib/constantes";
import { exigirSesion } from "@/lib/supabase/sesion";

export const metadata: Metadata = { title: "Sin acceso" };

/**
 * Pantalla de módulo cerrado. Dice con qué rol entró la persona y a quién
 * pedirle el cambio: un «403» a secas sólo genera un mensaje de WhatsApp
 * preguntando qué pasó.
 */
export default async function SinAcceso() {
  const { perfil } = await exigirSesion();

  return (
    <main className="grid min-h-dvh place-items-center bg-mist px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center ring-1 ring-hair shadow-elevada">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-coral-50 text-coral">
          <Icono nombre="candado" className="size-6" />
        </span>
        <h1 className="mt-4 text-[1.2rem] font-semibold tracking-tight text-ink">
          Este módulo no está abierto para tu rol
        </h1>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-slate">
          Entraste como <strong className="font-semibold text-ink">{ROLES[perfil.rol].nombre}</strong>.{" "}
          {ROLES[perfil.rol].descripcion} Si necesitas entrar aquí, pídele a un
          administrador que ajuste tu rol desde Equipo.
        </p>
        <BotonEnlace href="/" tono="oscuro" className="mt-6">
          <Icono nombre="tablero" className="size-4" />
          Volver al resumen
        </BotonEnlace>
      </div>
    </main>
  );
}
