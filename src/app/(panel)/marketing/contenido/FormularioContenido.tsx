"use client";

import { useRef, useState } from "react";
import { Boton } from "@/components/ui/Boton";
import { Campo, CampoSelect, CampoTexto, Casilla } from "@/components/ui/Campo";
import { Icono } from "@/components/ui/Icono";
import { clienteNavegador } from "@/lib/supabase/navegador";
import { guardarContenido, registrarMediosContenido } from "../acciones";

const FORMATOS = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"]);

export function FormularioContenido() {
  const formulario = useRef<HTMLFormElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [estado, setEstado] = useState<{ malo: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guardando) return;
    const fd = new FormData(event.currentTarget);
    const validos = archivos.filter((archivo) => FORMATOS.has(archivo.type));
    if (validos.length !== archivos.length) {
      setEstado({ malo: true, texto: "Usa JPG, PNG, WEBP, MP4 o MOV." });
      return;
    }
    if (validos.some((archivo) => archivo.size > 100 * 1024 * 1024)) {
      setEstado({ malo: true, texto: "Cada archivo debe pesar máximo 100 MB." });
      return;
    }

    setGuardando(true);
    setEstado(null);
    const contenido = await guardarContenido(fd);
    if (!contenido.ok) {
      setGuardando(false);
      setEstado({ malo: true, texto: contenido.error });
      return;
    }

    if (validos.length > 0) {
      const supabase = clienteNavegador();
      const medios: { path: string; mime: string; tipo: "imagen" | "video"; orden: number }[] = [];
      try {
        for (const [orden, archivo] of validos.entries()) {
          const extension = archivo.name.split(".").pop()?.toLowerCase() || (archivo.type.startsWith("video/") ? "mp4" : "jpg");
          const path = `${contenido.id}/${crypto.randomUUID()}.${extension}`;
          const { error } = await supabase.storage.from("avansa-contenido").upload(path, archivo, {
            contentType: archivo.type,
            upsert: false,
          });
          if (error) throw error;
          medios.push({
            path,
            mime: archivo.type,
            tipo: archivo.type.startsWith("video/") ? "video" : "imagen",
            orden,
          });
        }
        const registro = await registrarMediosContenido(contenido.id, medios);
        if (!registro.ok) throw new Error(registro.error);
      } catch (error) {
        setGuardando(false);
        setEstado({
          malo: true,
          texto: `La pieza quedó guardada, pero un archivo no se registró: ${error instanceof Error ? error.message : "intenta subirlo de nuevo"}`,
        });
        return;
      }
    }

    formulario.current?.reset();
    setArchivos([]);
    setGuardando(false);
    setEstado({ malo: false, texto: contenido.aviso });
  }

  return (
    <form ref={formulario} onSubmit={enviar} className="space-y-3">
      <Campo etiqueta="Título interno" name="titulo" requerido placeholder="Reel · Ahorro para vivienda" />
      <CampoTexto etiqueta="Copy" name="texto" filas={4}
        placeholder="Texto que acompañará la publicación. Puedes dejarlo pendiente y completarlo después." />

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="Formato" name="tipo" defaultValue="publicacion">
          <option value="publicacion">Publicación</option>
          <option value="historia">Historia</option>
          <option value="reel">Reel</option>
        </CampoSelect>
        <CampoSelect etiqueta="Estado" name="estado" defaultValue="borrador">
          <option value="borrador">Borrador</option>
          <option value="programado">Programar</option>
        </CampoSelect>
      </div>

      <Campo etiqueta="Fecha y hora" name="programado_para" type="datetime-local"
        ayuda="obligatorio sólo si programas" />

      <fieldset className="rounded-xl bg-mist p-3.5">
        <legend className="px-1 text-[0.78rem] font-semibold text-ink">Canales</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <Casilla name="plataformas" value="instagram" defaultChecked etiqueta="Instagram"
            descripcion="Feed, reel o historia según el formato." />
          <Casilla name="plataformas" value="facebook" etiqueta="Facebook"
            descripcion="Publicación y formatos compatibles." />
        </div>
      </fieldset>

      <label className="block rounded-xl border border-dashed border-hair-fuerte bg-mist px-3.5 py-3">
        <span className="text-[0.78rem] font-semibold text-ink">Archivo visual</span>
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple
          className="mt-2 block w-full text-[0.76rem] text-slate file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-2.5 file:py-1.5 file:text-[0.74rem] file:font-semibold file:text-ink file:ring-1 file:ring-hair"
          onChange={(event) => setArchivos([...event.target.files ?? []])} />
        <span className="mt-1.5 block text-[0.72rem] leading-snug text-slate">JPG, PNG, WEBP, MP4 o MOV. Hasta 100 MB por archivo; se guardan privados.</span>
      </label>

      {archivos.length > 0 && (
        <p className="text-[0.74rem] text-slate">{archivos.length} archivo{archivos.length === 1 ? "" : "s"} listo{archivos.length === 1 ? "" : "s"} para subir.</p>
      )}
      <p className="rounded-xl bg-sand-50 px-3 py-2.5 text-[0.74rem] leading-snug text-sand-700">
        Programar lo deja en el calendario. La publicación automática se activa cuando quede aprobada la conexión oficial de Meta.
      </p>
      {estado && (
        <p role={estado.malo ? "alert" : "status"}
          className={`flex gap-2 rounded-xl px-3 py-2 text-[0.76rem] ${estado.malo ? "bg-coral-50 text-coral-700" : "bg-teal-50 text-teal-700"}`}>
          <Icono nombre={estado.malo ? "alerta" : "cheque"} className="mt-px size-4 shrink-0" />
          {estado.texto}
        </p>
      )}
      <Boton type="submit" tono="coral" disabled={guardando}>
        <Icono nombre="calendario" className="size-4" />
        {guardando ? "Guardando…" : "Guardar en calendario"}
      </Boton>
    </form>
  );
}
