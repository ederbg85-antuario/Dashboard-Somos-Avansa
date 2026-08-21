"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Campo, CampoMonto, CampoSelect, CampoTexto } from "@/components/ui/Campo";
import { Boton } from "@/components/ui/Boton";
import { Icono } from "@/components/ui/Icono";
import { METODOS_PAGO, NATURALEZAS } from "@/lib/constantes";
import { dinero, iso } from "@/lib/formato";
import type { Campana, CategoriaFinanzas } from "@/lib/supabase/tipos";
import { guardarMovimiento, type Resultado } from "./acciones";

/**
 * Captura de un movimiento.
 *
 * El formulario arranca por el tipo (ingreso o egreso) porque eso recorta el
 * catálogo a la mitad y evita el error más común: registrar un gasto contra
 * una cuenta de ingreso. El IVA se calcula solo al 16 % con un toque, pero se
 * puede escribir a mano para los casos exentos o a tasa cero.
 */
export function CapturaMovimiento({
  categorias, campanas, expedientes,
}: {
  categorias: CategoriaFinanzas[];
  campanas: Campana[];
  expedientes: { id: string; nombre: string }[];
}) {
  const [tipo, setTipo] = useState<"ingreso" | "egreso">("egreso");
  const [monto, setMonto] = useState("");
  const [iva, setIva] = useState("");

  const [estado, ejecutar] = useActionState(
    async (_p: Resultado, fd: FormData) => {
      const r = await guardarMovimiento(fd);
      if (r.ok) { setMonto(""); setIva(""); }
      return r;
    },
    { ok: true } as Resultado,
  );

  const delTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo && c.activo),
    [categorias, tipo],
  );

  return (
    <form action={ejecutar} className="space-y-3">
      {/* Ingreso o egreso, como interruptor: es la primera decisión. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-mist p-1">
        {(["ingreso", "egreso"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={`h-9 rounded-lg text-[0.82rem] font-semibold transition ${
              tipo === t
                ? t === "ingreso" ? "bg-teal text-white shadow-tarjeta" : "bg-coral text-white shadow-tarjeta"
                : "text-slate hover:text-ink"
            }`}
          >
            {t === "ingreso" ? "Ingreso" : "Egreso"}
          </button>
        ))}
      </div>

      <CampoSelect etiqueta="Categoría" name="categoria_id" requerido key={tipo}
                   ayuda="define el renglón del resultado">
        {delTipo.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre} — {NATURALEZAS[c.naturaleza].corto}
          </option>
        ))}
      </CampoSelect>

      <Campo etiqueta="Concepto" name="concepto" requerido
             placeholder={tipo === "ingreso" ? "Honorarios de gestión · María Ríos" : "Renta de oficina · agosto"} />

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoMonto etiqueta="Monto sin IVA" name="monto" requerido value={monto}
                    onChange={(e) => setMonto(e.target.value)} placeholder="0.00" />
        <div>
          <CampoMonto etiqueta="IVA" name="iva" value={iva}
                      onChange={(e) => setIva(e.target.value)} placeholder="0.00"
                      ayuda="fuera del margen" />
          {monto && (
            <button
              type="button"
              onClick={() => setIva(((Number(monto) || 0) * 0.16).toFixed(2))}
              className="mt-1 text-[0.7rem] font-semibold text-coral hover:underline"
            >
              Calcular 16 % ({dinero((Number(monto) || 0) * 0.16)})
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha" name="fecha" type="date" requerido defaultValue={iso()} />
        <CampoSelect etiqueta="Estatus" name="estatus" defaultValue="pagado"
                     ayuda="sólo lo pagado entra al resultado">
          <option value="pagado">Pagado / cobrado</option>
          <option value="pendiente">Pendiente</option>
          <option value="cancelado">Cancelado</option>
        </CampoSelect>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect etiqueta="Método de pago" name="metodo_pago" defaultValue="Transferencia">
          {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
        </CampoSelect>
        <Campo etiqueta="Referencia" name="referencia" placeholder="Folio, factura o autorización" />
      </div>

      {/* Ligas opcionales: son las que permiten margen por expediente y ROAS. */}
      {tipo === "ingreso" ? (
        <CampoSelect etiqueta="Expediente relacionado" name="lead_id" defaultValue=""
                     ayuda="permite el margen por cliente">
          <option value="">Sin relacionar</option>
          {expedientes.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </CampoSelect>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoSelect etiqueta="Campaña relacionada" name="campana_id" defaultValue=""
                       ayuda="para el retorno de pauta">
            <option value="">Sin relacionar</option>
            {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </CampoSelect>
          <CampoSelect etiqueta="Expediente relacionado" name="lead_id" defaultValue="">
            <option value="">Sin relacionar</option>
            {expedientes.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </CampoSelect>
        </div>
      )}

      <CampoTexto etiqueta="Notas" name="notas" filas={2} placeholder="Opcional." />

      <Aviso estado={estado} />
      <Enviar tipo={tipo} />
    </form>
  );
}

function Enviar({ tipo }: { tipo: "ingreso" | "egreso" }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" tono={tipo === "ingreso" ? "oscuro" : "coral"} disabled={pending} className="w-full">
      {pending ? "Guardando…" : `Registrar ${tipo}`}
    </Boton>
  );
}

function Aviso({ estado }: { estado: Resultado }) {
  if (estado.ok && !estado.aviso) return null;
  const malo = !estado.ok;
  return (
    <p role={malo ? "alert" : "status"}
       className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[0.78rem] leading-snug ${
         malo ? "bg-coral-50 text-coral-700" : "bg-teal-50 text-teal-700"}`}>
      <Icono nombre={malo ? "alerta" : "cheque"} className="mt-px size-4 shrink-0" />
      {malo ? estado.error : estado.aviso}
    </p>
  );
}
