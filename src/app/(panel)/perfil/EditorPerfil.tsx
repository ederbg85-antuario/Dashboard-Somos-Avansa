"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { iniciales } from "@/lib/formato";
import { clienteNavegador } from "@/lib/supabase/navegador";
import type { Perfil } from "@/lib/supabase/tipos";
import { actualizarPerfil, type ResultadoPerfil } from "./acciones";

export function EditorPerfil({ perfil, avatarUrl }: { perfil: Perfil; avatarUrl: string | null }) {
  const [resultado, ejecutar] = useActionState(
    async (_anterior: ResultadoPerfil | null, datos: FormData) => actualizarPerfil(datos),
    null,
  );
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState("");
  const inputFoto = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function subirFoto(archivo?: File) {
    if (!archivo) return;
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(archivo.type)) {
      setErrorFoto("Usa una imagen JPG, PNG o WebP.");
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setErrorFoto("La imagen debe pesar menos de 5 MB.");
      return;
    }

    setSubiendo(true);
    setErrorFoto("");
    const extension = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
    const ruta = `${perfil.id}/avatar.${extension}`;
    const supabase = clienteNavegador();
    const { error: errorSubida } = await supabase.storage
      .from("avansa-avatars")
      .upload(ruta, archivo, { upsert: true, contentType: archivo.type });

    if (errorSubida) {
      setErrorFoto(errorSubida.message);
      setSubiendo(false);
      return;
    }

    const { error: errorPerfil } = await supabase
      .from("perfiles")
      .update({ avatar_path: ruta })
      .eq("id", perfil.id);

    if (errorPerfil) setErrorFoto(errorPerfil.message);
    else router.refresh();
    setSubiendo(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
      <div className="rounded-2xl bg-mist p-5 text-center">
        <div className="mx-auto grid size-28 place-items-center overflow-hidden rounded-full bg-deep text-2xl font-bold text-white ring-4 ring-white shadow-tarjeta">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`Foto de ${perfil.nombre}`}
              width={112}
              height={112}
              unoptimized
              className="size-full object-cover"
            />
          ) : iniciales(`${perfil.nombre} ${perfil.apellidos}`)}
        </div>
        <input
          ref={inputFoto}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(evento) => subirFoto(evento.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputFoto.current?.click()}
          disabled={subiendo}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-[.78rem] font-semibold text-ink ring-1 ring-hair transition hover:ring-coral disabled:opacity-60"
        >
          <Icono nombre="subir" className="size-4" />
          {subiendo ? "Subiendo…" : "Cambiar foto"}
        </button>
        <p className="mt-2 text-[.68rem] leading-relaxed text-slate">JPG, PNG o WebP · máximo 5 MB</p>
        {errorFoto && <p role="alert" className="mt-2 text-[.72rem] text-coral">{errorFoto}</p>}
      </div>

      <form action={ejecutar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre" name="nombre" defaultValue={perfil.nombre} requerido />
          <Campo etiqueta="Apellidos" name="apellidos" defaultValue={perfil.apellidos} requerido />
          <Campo etiqueta="Teléfono" name="telefono" type="tel" defaultValue={perfil.telefono ?? ""} />
          <Campo etiqueta="Correo" value={perfil.email} disabled />
        </div>

        {resultado && (
          <p
            role={resultado.ok ? "status" : "alert"}
            className={`rounded-xl px-3 py-2 text-[.78rem] ${resultado.ok
              ? "bg-teal-50 text-teal-700"
              : "bg-coral-50 text-coral-700"}`}
          >
            {resultado.ok ? resultado.aviso : resultado.error}
          </p>
        )}
        <GuardarPerfil />
      </form>
    </div>
  );
}

function GuardarPerfil() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono="coral" disabled={pending}>
      {pending ? "Guardando…" : "Guardar perfil"}
    </Boton>
  );
}
