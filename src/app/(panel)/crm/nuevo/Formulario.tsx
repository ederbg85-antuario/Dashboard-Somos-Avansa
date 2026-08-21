"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Campo, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { ESTADOS_MX, USOS_MEJORA } from "@/lib/constantes";
import { crearLead, type Resultado } from "../acciones";

export function FormularioAlta() {
  const router = useRouter();
  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => crearLead(fd),
    { ok: true } as Resultado,
  );

  // Al guardar bien, se vuelve al tablero: dar de alta un expediente y
  // quedarse en el formulario vacío invita a duplicarlo.
  useEffect(() => {
    if (estado.ok && estado.aviso) {
      const t = setTimeout(() => router.push("/crm"), 900);
      return () => clearTimeout(t);
    }
  }, [estado, router]);

  return (
    <form action={ejecutar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo" name="nombre" requerido autoFocus
               placeholder="María Fernanda Ríos" />
        <Campo etiqueta="Teléfono" name="telefono" requerido inputMode="tel"
               placeholder="55 1234 5678" ayuda="10 dígitos" />
        <Campo etiqueta="Correo" name="email" type="email" placeholder="opcional" />
        <CampoSelect etiqueta="Estado de la República" name="estado_republica">
          <option value="">Sin especificar</option>
          {ESTADOS_MX.map((e) => <option key={e} value={e}>{e}</option>)}
        </CampoSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoMonto etiqueta="Saldo de Subcuenta declarado" name="saldo_subcuenta"
                    ayuda="lo que dice la persona" placeholder="0.00" />
        <CampoSelect etiqueta="Mejora que busca" name="tipo_mejora">
          <option value="">Sin definir</option>
          {USOS_MEJORA.map((u) => <option key={u} value={u}>{u}</option>)}
        </CampoSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="¿Cómo llegó?" name="origen" defaultValue="llamada">
          <option value="llamada">Llamada entrante</option>
          <option value="whatsapp">WhatsApp directo</option>
          <option value="recomendacion">Recomendación</option>
          <option value="presencial">Se presentó en oficina</option>
          <option value="captura-manual">Otro</option>
        </CampoSelect>
        <Campo etiqueta="Detalle del canal" name="canal"
               placeholder="Quién lo recomendó, qué campaña, etc." />
      </div>

      <CampoTexto etiqueta="Qué necesita" name="mensaje" filas={3}
                  placeholder="En sus palabras: qué quiere arreglar y con qué urgencia." />

      <p className="flex items-start gap-2 rounded-xl bg-sand-50 px-3.5 py-2.5 text-[0.78rem] leading-relaxed text-ink">
        <Icono nombre="escudo" className="mt-px size-4 shrink-0 text-sand" />
        Al dar de alta declaras que la persona autorizó que avansa la contacte y
        trate sus datos. El sistema no permite guardar un expediente sin ese
        consentimiento.
      </p>

      {!estado.ok && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-coral-50 px-3 py-2 text-[0.8rem] text-coral-700">
          <Icono nombre="alerta" className="size-4 shrink-0" />
          {estado.error}
        </p>
      )}
      {estado.ok && estado.aviso && (
        <p role="status" className="flex items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-[0.8rem] text-teal-700">
          <Icono nombre="cheque" className="size-4 shrink-0" />
          {estado.aviso} Volviendo al pipeline…
        </p>
      )}

      <Enviar />
    </form>
  );
}

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono="coral" disabled={pending}>
      {pending ? "Guardando…" : "Crear expediente"}
    </Boton>
  );
}
