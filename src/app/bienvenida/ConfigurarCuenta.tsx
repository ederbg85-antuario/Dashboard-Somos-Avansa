"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { clienteNavegador } from "@/lib/supabase/navegador";

export function ConfigurarCuenta({ nombreInicial, apellidosIniciales }: { nombreInicial: string; apellidosIniciales: string }) {
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError("");
    const datos = new FormData(evento.currentTarget);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const apellidos = String(datos.get("apellidos") ?? "").trim();
    const telefono = String(datos.get("telefono") ?? "").trim();
    const password = String(datos.get("password") ?? "");
    const confirma = String(datos.get("confirma") ?? "");

    if (nombre.length < 2 || apellidos.length < 2) {
      setError("Escribe tu nombre y apellidos.");
      return;
    }
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
    const { data: usuario, error: errorUsuario } = await supabase.auth.updateUser({
      password,
      data: { nombre, apellidos },
    });
    if (errorUsuario || !usuario.user) {
      setError(errorUsuario?.message ?? "No se pudo configurar la cuenta.");
      setGuardando(false);
      return;
    }

    const { error: errorPerfil } = await supabase
      .from("perfiles")
      .update({ nombre, apellidos, telefono: telefono || null, perfil_completo: true })
      .eq("id", usuario.user.id);

    if (errorPerfil) {
      setError(errorPerfil.message);
      setGuardando(false);
      return;
    }

    router.replace("/perfil");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre" name="nombre" defaultValue={nombreInicial} requerido />
        <Campo etiqueta="Apellidos" name="apellidos" defaultValue={apellidosIniciales} requerido />
      </div>
      <Campo etiqueta="Teléfono" name="telefono" type="tel" autoComplete="tel" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Contraseña" name="password" type="password" minLength={8} autoComplete="new-password" requerido />
        <Campo etiqueta="Confirmar contraseña" name="confirma" type="password" minLength={8} autoComplete="new-password" requerido />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-[.78rem] text-coral-700">
          <Icono nombre="alerta" className="mt-px size-4 shrink-0" /> {error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-coral text-[.88rem] font-semibold text-white shadow-tarjeta transition hover:bg-coral-700 disabled:opacity-60"
      >
        {guardando ? "Configurando…" : "Entrar al equipo avansa"}
        {!guardando && <Icono nombre="chevron" className="size-4" />}
      </button>
    </form>
  );
}
