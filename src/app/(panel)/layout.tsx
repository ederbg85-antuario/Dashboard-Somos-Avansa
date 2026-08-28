import { BarraLateral } from "@/components/panel/BarraLateral";
import { menuPara } from "@/components/panel/navegacion";
import { DISCLAIMER } from "@/lib/constantes";
import { exigirSesion } from "@/lib/supabase/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/**
 * Armazón del panel: barra lateral fija y una sola zona de contenido con su
 * propio scroll. El menú no se mueve al desplazarse dentro de una tabla larga,
 * que es lo que hace que un panel se sienta aplicación y no página web.
 *
 * La sesión se resuelve aquí una vez y el menú llega ya recortado al rol.
 */
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { perfil, email } = await exigirSesion();
  const supabase = await clienteServidor();
  const avatarUrl = perfil.avatar_path
    ? (await supabase.storage.from("avansa-avatars").createSignedUrl(perfil.avatar_path, 3600)).data?.signedUrl ?? null
    : null;

  return (
    <div className="dashboard-sin-bordes min-h-dvh lg:flex">
      <BarraLateral
        grupos={menuPara(perfil.rol)}
        nombre={perfil.nombre}
        email={email}
        rol={perfil.rol}
        avatarUrl={avatarUrl}
      />

      <div className="panel-contenido flex min-w-0 flex-1 flex-col">
        <main className="imprimir-completo flex-1 px-4 py-6 sm:px-7 sm:py-8 lg:pr-8">
          <div className="mx-auto w-full max-w-[86rem] animate-entrar">{children}</div>
        </main>

        <footer className="no-imprimir px-4 py-5 sm:px-7">
          <p className="mx-auto max-w-[86rem] text-[0.68rem] leading-relaxed text-slate-400">
            {DISCLAIMER}
          </p>
        </footer>
      </div>
    </div>
  );
}
