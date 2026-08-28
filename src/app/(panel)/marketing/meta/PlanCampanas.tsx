import { Icono } from "@/components/ui/Icono";
import { Insignia } from "@/components/ui/Insignia";
import { dineroCorto, numero } from "@/lib/formato";
import { PLANES_CAMPANA } from "../_lib/planes-campana";

export function PlanCampanas({
  campanasRegistradas,
  campanasEnMeta,
}: {
  campanasRegistradas: number;
  campanasEnMeta: number;
}) {
  return (
    <section className="mt-4 rounded-2xl bg-white p-5 shadow-tarjeta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-coral-50 text-coral-700">
              <Icono nombre="escudo" className="size-4" />
            </span>
            <div>
              <h2 className="text-[0.95rem] font-semibold text-ink">Campañas publicadas en Meta</h2>
              <p className="mt-0.5 text-[0.76rem] text-slate">Meta confirmó 11 anuncios y ya los está procesando.</p>
            </div>
          </div>
        </div>
        <Insignia solida color="#556270">
          {numero(campanasEnMeta)} en Meta · {numero(campanasRegistradas)} en Avansa
        </Insignia>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {PLANES_CAMPANA.map((plan) => (
          <article key={plan.clave} className="rounded-2xl bg-mist p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.86rem] font-semibold text-ink">{plan.nombre}</p>
                <p className="mt-1 text-[0.72rem] text-slate">{plan.audiencia}</p>
              </div>
              <Insignia solida color="#556270">
                {campanasEnMeta >= PLANES_CAMPANA.length ? "Publicada en Meta" : "Plan en Avansa"}
              </Insignia>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <Dato etiqueta="Diario" valor={dineroCorto(plan.presupuestoDiario)} />
              <Dato etiqueta="Creativos" valor={`${plan.creativos.length} seleccionados`} />
              <Dato
                etiqueta="Fechas"
                valor={plan.clave === "trafico-sitio" ? "28 ago – 4 sep" : "Desde 28 ago"}
              />
            </dl>
            <details className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[0.72rem] text-slate shadow-[0_8px_20px_-20px_rgb(15_45_61/.5)]">
              <summary className="cursor-pointer font-semibold text-ink">Material seleccionado</summary>
              <ol className="mt-2 space-y-1 pl-4">
                {plan.creativos.map((creativo) => <li key={creativo} className="list-decimal">{creativo}</li>)}
              </ol>
            </details>
            <details className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[0.72rem] text-slate shadow-[0_8px_20px_-20px_rgb(15_45_61/.5)]">
              <summary className="cursor-pointer font-semibold text-ink">Código de seguimiento</summary>
              <code className="mt-2 block break-all font-mono text-[0.66rem] leading-relaxed">{plan.utm}</code>
            </details>
            <p className="mt-3 text-[0.7rem] leading-relaxed text-slate">
              Destino: somosavansa.com · Medición prevista: {plan.conversiones.join(" y ").toLowerCase()}.
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Validacion texto="Cuenta, MXN y página" estado="Verificado" listo />
        <Validacion texto="Píxel y dataset" estado="Verificado" listo />
        <Validacion texto="Pago y teléfono" estado="Verificado" listo />
        <Validacion texto="Publicación en Meta" estado="11 de 11" listo />
      </div>
      <p className="mt-3 text-[0.72rem] leading-relaxed text-slate">
        Las dos campañas están publicadas y activadas con un límite de $200 MXN diarios cada una. Meta confirmó los 11 anuncios: cinco de Clientes potenciales y la prueba de Tráfico con sus cinco versiones y anuncio base. Actualmente están procesándose para revisión y entrega.
      </p>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate">{etiqueta}</dt>
      <dd className="cifra mt-1 text-[0.8rem] font-semibold text-ink">{valor}</dd>
    </div>
  );
}

function Validacion({
  texto,
  estado,
  listo = false,
}: {
  texto: string;
  estado: string;
  listo?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-sand-50 px-3 py-2 text-[0.72rem] font-medium text-ink">
      <Icono nombre={listo ? "cheque" : "reloj"} className={`size-3.5 shrink-0 ${listo ? "text-teal" : "text-sand"}`} />
      <span>{texto}</span>
      <span className={`ml-auto ${listo ? "text-teal-700" : "text-slate"}`}>{estado}</span>
    </div>
  );
}
