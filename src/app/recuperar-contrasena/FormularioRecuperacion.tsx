"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { clienteNavegador } from "@/lib/supabase/navegador";

export function FormularioRecuperacion() {
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");

    const datos = new FormData(evento.currentTarget);
    const email = String(datos.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError("Escribe un correo válido.");
      return;
    }

    setEnviando(true);
    const supabase = clienteNavegador();
    const { error: errorEnvio } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/restablecer-contrasena`,
    });

    if (errorEnvio) {
      const mensaje = errorEnvio.message.toLowerCase();
      setError(
        mensaje.includes("rate limit") || mensaje.includes("too many")
          ? "Ya se solicitó un correo hace poco. Espera un minuto y vuelve a intentar."
          : "No se pudo enviar el correo ahora. Intenta nuevamente en unos minutos.",
      );
      setEnviando(false);
      return;
    }

    // Supabase responde igual aunque el correo no exista para impedir que se
    // pueda enumerar quién forma parte del equipo.
    setEnviado(true);
    setEnviando(false);
  }

  if (enviado) {
    return (
      <div className="space-y-5">
        <div role="status" className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-100">
          <p className="flex items-start gap-2 text-[0.84rem] font-semibold text-teal-800">
            <Icono nombre="correo" className="mt-px size-4 shrink-0" />
            Revisa tu correo
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-slate">
            Si el correo pertenece a una cuenta de avansa, recibirás un enlace para elegir una contraseña nueva. Revisa también Spam y Promociones.
          </p>
        </div>
        <Link
          href="/entrar"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-deep text-[0.88rem] font-semibold text-white transition hover:bg-ink"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo
        etiqueta="Correo"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        requerido
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[0.8rem] leading-snug text-coral-700">
          <Icono nombre="alerta" className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-[0.88rem] font-semibold text-white shadow-tarjeta transition hover:bg-coral-700 disabled:opacity-60"
      >
        {enviando ? "Enviando…" : "Enviar enlace de recuperación"}
        {!enviando && <Icono nombre="chevron" className="size-4" grosor={2.2} />}
      </button>

      <Link
        href="/entrar"
        className="flex items-center justify-center gap-1.5 text-[0.76rem] font-medium text-slate transition hover:text-ink"
      >
        <Icono nombre="volver" className="size-3.5" />
        Volver a iniciar sesión
      </Link>
    </form>
  );
}
