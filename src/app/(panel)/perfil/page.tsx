import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";
import { EditorPerfil } from "./EditorPerfil";

export const metadata: Metadata = { title: "Mi perfil" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const { perfil } = await exigirSesion();
  const supabase = await clienteServidor();
  const avatarUrl = perfil.avatar_path
    ? (await supabase.storage.from("avansa-avatars").createSignedUrl(perfil.avatar_path, 3600)).data?.signedUrl ?? null
    : null;

  return (
    <>
      <Encabezado
        titulo="Mi perfil"
        apoyo="Tu información dentro del equipo de avansa. La foto se guarda de forma privada."
      />
      <Tarjeta>
        <EditorPerfil perfil={perfil} avatarUrl={avatarUrl} />
      </Tarjeta>
    </>
  );
}
