import { BarraLateral } from "@/components/panel/BarraLateral";
import { menuPara } from "@/components/panel/navegacion";
import { DISCLAIMER } from "@/lib/constantes";
import { exigirSesion } from "@/lib/supabase/sesion";

/**
 * Armazón del panel: barra lateral fija y una sola zona de contenido con su
 * propio scroll. El menú no se mueve al desplazarse dentro de una tabla larga,
 * que es lo que hace que un panel se sienta aplicación y no página web.
 *
 * La sesión se resuelve aquí una vez y el menú llega ya recortado al rol.
 */
export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const { perfil, email } = await exigirSesion();

  return (
    <div className="min-h-dvh lg:flex">
      <BarraLateral
        grupos={menuPara(perfil.rol)}
        nombre={perfil.nombre}
        email={email}
        rol={perfil.rol}
      />

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[262px]">
        <main className="imprimir-completo flex-1 px-4 py-6 sm:px-7 sm:py-8">
          <div className="mx-auto w-full max-w-[86rem] animate-entrar">{children}</div>
        </main>

        <footer className="no-imprimir border-t border-hair px-4 py-5 sm:px-7">
          <p className="mx-auto max-w-[86rem] text-[0.68rem] leading-relaxed text-slate-400">
            {DISCLAIMER}
          </p>
        </footer>
      </div>
    </div>
  );
}
