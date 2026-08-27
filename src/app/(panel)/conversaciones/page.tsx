import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Vacio } from "@/components/ui/Vacio";
import { cargarBandeja } from "@/lib/bandeja";
import { exigirRol } from "@/lib/supabase/sesion";
import { equipo as cargarEquipo } from "@/lib/datos";
import { Bandeja } from "./Bandeja";

export const metadata: Metadata = { title: "Conversaciones" };
export const dynamic = "force-dynamic";

/**
 * La bandeja del equipo.
 *
 * Los mensajes viven en Chatwoot, que es quien habla con WhatsApp. Aquí se
 * atienden. La primera carga se resuelve en el servidor para que la pantalla
 * llegue con contenido; de ahí en adelante refresca sola.
 */
export default async function Conversaciones() {
  const sesion = await exigirRol("admin", "asesor");

  const [estado, equipo] = await Promise.all([cargarBandeja(sesion), cargarEquipo()]);

  if (!estado.listo) {
    return (
      <>
        <Encabezado
          titulo="Conversaciones"
          apoyo="Los mensajes de WhatsApp del equipo, en un solo lugar."
        />
        <Tarjeta padding={false}>
          {estado.motivo === "sin-configurar" ? (
            <Vacio
              icono="conversacion"
              titulo="Falta conectar Chatwoot"
              texto={
                "El panel todavía no sabe a qué instancia hablarle. Hay que llenar " +
                "CHATWOOT_URL, CHATWOOT_TOKEN, CHATWOOT_CUENTA_ID y CHATWOOT_BANDEJA_ID " +
                "en las variables de entorno. Están explicadas en .env.example."
              }
            />
          ) : (
            <Vacio
              icono="alerta"
              titulo="Chatwoot no contestó"
              texto={estado.detalle}
            />
          )}
        </Tarjeta>
      </>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Conversaciones"
        apoyo={
          sesion.perfil.rol === "admin"
            ? "Supervisión completa de WhatsApp. Puedes reasignar; las respuestas corresponden a los asesores."
            : "Sólo las conversaciones que el reparto automático asignó a tu perfil."
        }
      />
      <Bandeja
        inicial={estado.filas}
        ocultas={estado.total - estado.filas.length}
        rol={sesion.perfil.rol}
        equipo={equipo.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol }))}
      />
    </>
  );
}
