"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { clienteNavegador } from "@/lib/supabase/navegador";

export function FormularioNuevaContrasena() {
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");

    const datos = new FormData(evento.currentTarget);
    const password = String(datos.get("password") ?? "");
    const confirma = String(datos.get("confirma") ?? "");

    if (password.length < 8) {
      setError("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (password !== confirma) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setGuardando(true);
    const supabase = clienteNavegador();
    const { error: errorUsuario } = await supabase.auth.updateUser({ password });

    if (errorUsuario) {
      const mensaje = errorUsuario.message.toLowerCase();
      setError(
        mensaje.includes("same password")
          ? "Elige una contraseña distinta de la anterior."
          : mensaje.includes("weak") || mensaje.includes("password")
            ? "Esa contraseña no cumple los requisitos de seguridad. Prueba con una más larga y difícil de adivinar."
            : "No se pudo actualizar la contraseña. Solicita un enlace nuevo e inténtalo otra vez.",
      );
      setGuardando(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="mt-6 space-y-4">
      <Campo
        etiqueta="Contraseña nueva"
        name="password"
        type="password"
        minLength={8}
        autoComplete="new-password"
        requerido
      />
      <Campo
        etiqueta="Confirmar contraseña"
        name="confirma"
        type="password"
        minLength={8}
        autoComplete="new-password"
        requerido
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[0.78rem] leading-relaxed text-coral-700">
          <Icono nombre="alerta" className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-[0.88rem] font-semibold text-white shadow-tarjeta transition hover:bg-coral-700 disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Guardar contraseña y entrar"}
        {!guardando && <Icono nombre="chevron" className="size-4" grosor={2.2} />}
      </button>
    </form>
  );
}
