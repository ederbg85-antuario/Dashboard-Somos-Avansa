import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { Icono } from "@/components/ui/Icono";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Vacio } from "@/components/ui/Vacio";
import { cargarBandeja } from "@/lib/bandeja";
import { exigirRol } from "@/lib/supabase/sesion";
import { equipo as cargarEquipo } from "@/lib/datos";
import { Bandeja, type Fila, type Mensaje } from "./Bandeja";

export const metadata: Metadata = { title: "Bandeja de entrada" };
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

  if (!estado.listo && estado.motivo === "error") {
    return (
      <>
        <Encabezado
          titulo="Bandeja de entrada"
          apoyo="Atención de WhatsApp dentro de avansa."
        />
        <Tarjeta className="animate-entrar shadow-elevada">
          <Vacio
            icono="alerta"
            titulo="La bandeja no está disponible"
            texto="No fue posible consultar Chatwoot en este momento. Recarga la página para volver a intentarlo; no se muestran conversaciones de ejemplo para evitar confusiones."
          />
        </Tarjeta>
      </>
    );
  }

  if (!estado.listo) {
    const asesor = sesion.perfil.rol === "asesor"
      ? sesion.perfil
      : equipo.find((persona) => persona.rol === "asesor" && persona.activo) ?? null;
    const demo: Fila[] = [{
      id: -1,
      nombre: "Mariana López",
      telefono: "+52 55 1234 5678",
      avance: "Sí, me interesa conocer el proceso para usar mi crédito.",
      ultimoEn: "2026-08-27T20:33:00.000Z",
      entranteSinResponder: true,
      sinAtender: true,
      sinLeer: 1,
      asignadoA: asesor?.id ?? null,
      asignadoNombre: asesor?.nombre ?? "Asesor avansa",
      mia: sesion.perfil.rol === "asesor",
      libre: !asesor,
      etapa: null,
    }];
    const mensajesDemo: Mensaje[] = [
      {
        id: -4,
        texto: "Hola 👋 Soy Mariana. Vi la página de avansa y quiero saber si puedo mejorar mi casa con mi crédito Infonavit.",
        mio: false,
        entrante: true,
        en: "2026-08-27T20:23:00.000Z",
        autor: null,
        adjuntos: [],
      },
      {
        id: -3,
        texto: "¡Hola, Mariana! Claro que sí. En avansa te acompañamos durante todo el proceso. ¿Actualmente tienes un crédito Infonavit activo?",
        mio: true,
        entrante: false,
        en: "2026-08-27T20:27:00.000Z",
        autor: asesor?.nombre ?? "Asesor avansa",
        adjuntos: [],
      },
      {
        id: -2,
        texto: "Sí, lo tengo activo y también cuento con ahorro para vivienda.",
        mio: false,
        entrante: true,
        en: "2026-08-27T20:30:00.000Z",
        autor: null,
        adjuntos: [],
      },
      {
        id: -1,
        texto: "Sí, me interesa conocer el proceso para usar mi crédito.",
        mio: false,
        entrante: true,
        en: "2026-08-27T20:33:00.000Z",
        autor: null,
        adjuntos: [],
      },
    ];

    return (
      <>
        <Encabezado
          titulo="Bandeja de entrada"
          apoyo="Atención de WhatsApp dentro de avansa."
        />
        <div className="mb-4 flex animate-entrar items-start gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-deep to-deep-700 px-4 py-3.5 text-white shadow-elevada">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15 text-[#73e59d] shadow-inner">
            <Icono nombre="whatsapp" className="size-[18px]" />
          </span>
          <div>
            <p className="text-[0.82rem] font-bold">Vista previa del canal</p>
            <p className="mt-0.5 max-w-3xl text-[0.74rem] leading-relaxed text-white/70">
              Se reemplazará por mensajes reales al vincular el número oficial.
            </p>
          </div>
        </div>
        <Bandeja
          inicial={demo}
          ocultas={0}
          rol={sesion.perfil.rol}
          equipo={equipo.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol }))}
          modoDemo
          mensajesDemo={mensajesDemo}
          etapasDisponibles={false}
        />
      </>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Bandeja de entrada"
        apoyo={
          sesion.perfil.rol === "admin"
            ? "Supervisa atención, etapas y asignaciones."
            : "Sólo aparecen tus conversaciones asignadas."
        }
      />
      <Bandeja
        inicial={estado.filas}
        ocultas={estado.total - estado.filas.length}
        rol={sesion.perfil.rol}
        equipo={equipo.map((p) => ({ id: p.id, nombre: p.nombre, rol: p.rol }))}
        etapasDisponibles={estado.etapasDisponibles}
      />
    </>
  );
}
