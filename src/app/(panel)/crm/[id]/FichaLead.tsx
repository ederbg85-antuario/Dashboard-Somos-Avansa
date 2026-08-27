"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Campo, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { CLASIFICACIONES, ESTADOS_MX } from "@/lib/constantes";
import type { Lead, Perfil } from "@/lib/supabase/tipos";
import { actualizarLead, registrarActividad, type Resultado } from "../acciones";

const inicial: Resultado = { ok: true };

/** Datos y clasificación del expediente. */
export function FormularioFicha({
  lead,
  equipo,
  esAdmin,
}: {
  lead: Lead;
  equipo: Perfil[];
  esAdmin: boolean;
}) {
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => actualizarLead(fd),
    inicial,
  );

  return (
    <form action={ejecutar} className="space-y-4">
      <input type="hidden" name="id" value={lead.id} />

      <div className={`grid gap-3 ${esAdmin ? "sm:grid-cols-2" : ""}`}>
        <Campo etiqueta="Nombre completo" name="nombre" defaultValue={lead.nombre} requerido />
        <Campo etiqueta="Teléfono" name="telefono" defaultValue={lead.telefono} requerido />
        <Campo etiqueta="Correo" name="email" type="email" defaultValue={lead.email ?? ""} />
        <CampoSelect etiqueta="Estado de la República" name="estado_republica"
                     defaultValue={lead.estado_republica ?? ""}>
          <option value="">Sin especificar</option>
          {ESTADOS_MX.map((e) => <option key={e} value={e}>{e}</option>)}
        </CampoSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoMonto etiqueta="Saldo de Subcuenta declarado" name="saldo_subcuenta"
                    defaultValue={lead.saldo_subcuenta ?? ""}
                    ayuda="lo que declara la persona" />
        <Campo etiqueta="Mejora que busca" name="tipo_mejora" defaultValue={lead.tipo_mejora ?? ""} />
        <CampoSelect etiqueta="¿La vivienda está a su nombre?" name="vivienda_a_su_nombre"
                     defaultValue={lead.vivienda_a_su_nombre === null ? "" : lead.vivienda_a_su_nombre ? "si" : "no"}>
          <option value="">No lo indicó</option>
          <option value="si">Sí</option>
          <option value="no">No — requiere cadena de actas</option>
        </CampoSelect>
        <CampoMonto etiqueta="Honorarios estimados" name="valor_estimado"
                    defaultValue={lead.valor_estimado ?? ""}
                    ayuda="alimenta el valor del pipeline" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="Clasificación de viabilidad" name="clasificacion"
                     defaultValue={lead.clasificacion ?? ""}
                     ayuda="interna de avansa">
          <option value="">Sin clasificar</option>
          {(["A", "B", "C", "D"] as const).map((g) => (
            <option key={g} value={g}>{CLASIFICACIONES[g].nombre}</option>
          ))}
        </CampoSelect>
        {esAdmin && (
          <CampoSelect etiqueta="Asesor responsable" name="asesor_id" defaultValue={lead.asesor_id ?? ""}>
            <option value="">Sin asignar</option>
            {equipo.filter((p) => p.rol === "asesor" && p.activo).map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} {p.apellidos}</option>
            ))}
          </CampoSelect>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <Campo etiqueta="Próxima acción" name="proxima_accion"
               defaultValue={lead.proxima_accion ?? ""}
               placeholder="Llamar para confirmar documentos" />
        <Campo etiqueta="¿Cuándo?" name="fecha_proxima_accion" type="date"
               defaultValue={lead.fecha_proxima_accion ?? ""} />
      </div>

      <CampoTexto etiqueta="Notas internas" name="notas_internas" filas={4}
                  defaultValue={lead.notas_internas ?? ""}
                  ayuda="no las ve la persona"
                  placeholder="Contexto que el siguiente asesor necesita saber." />

      <Aviso estado={estado} />
      <Guardar>Guardar cambios</Guardar>
    </form>
  );
}

/** Registrar una llamada, un WhatsApp o una nota en la bitácora. */
export function FormularioActividad({ leadId }: { leadId: string }) {
  // El contador vive dentro del estado de la acción y sube con cada registro
  // exitoso. Sirve de `key` para vaciar el formulario: se registran varias
  // actividades seguidas y dejar el texto anterior invita a duplicarla.
  const [estado, ejecutar] = useActionState<Resultado & { registradas: number }, FormData>(
    async (previo, fd) => {
      const r = await registrarActividad(fd);
      return { ...r, registradas: previo.registradas + (r.ok ? 1 : 0) };
    },
    { ok: true, registradas: 0 },
  );

  return (
    <form action={ejecutar} className="space-y-3" key={estado.registradas}>
      <input type="hidden" name="lead_id" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-[9.5rem_1fr]">
        <CampoSelect etiqueta="Tipo" name="tipo" defaultValue="llamada">
          <option value="llamada">Llamada</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="correo">Correo</option>
          <option value="reunion">Reunión</option>
          <option value="nota">Nota</option>
        </CampoSelect>
        <Campo etiqueta="¿Qué pasó?" name="titulo" requerido
               placeholder="Confirmó que la casa está a nombre de su mamá" />
      </div>
      <CampoTexto etiqueta="Detalle" name="detalle" filas={2}
                  placeholder="Opcional. Lo que el siguiente asesor necesita saber." />
      <Aviso estado={estado} />
      <Guardar tono="oscuro">Registrar en la bitácora</Guardar>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function Aviso({ estado }: { estado: Resultado }) {
  if (estado.ok && !estado.aviso) return null;
  const malo = !estado.ok;
  return (
    <p
      role={malo ? "alert" : "status"}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[0.78rem] ${
        malo ? "bg-coral-50 text-coral-700" : "bg-teal-50 text-teal-700"
      }`}
    >
      <Icono nombre={malo ? "alerta" : "cheque"} className="size-4 shrink-0" />
      {malo ? estado.error : estado.aviso}
    </p>
  );
}

function Guardar({ children, tono = "coral" }: { children: React.ReactNode; tono?: "coral" | "oscuro" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono={tono} disabled={pending}>
      {pending ? "Guardando…" : children}
    </Boton>
  );
}
