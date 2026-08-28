import type { Metadata } from "next";
import { Embudo } from "@/components/graficas/Embudo";
import { Encabezado } from "@/components/panel/Encabezado";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { Icono, type NombreIcono } from "@/components/ui/Icono";
import { Insignia } from "@/components/ui/Insignia";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { embudoAcumulado } from "@/lib/constantes";
import { totalizarPauta } from "@/lib/datos";
import { dineroCorto, finDelDia, inicioDelDia, numero } from "@/lib/formato";
import { resumenGoogle } from "@/lib/google/insights";
import { resolverPeriodo } from "@/lib/periodo";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { Lead, MetricaCampana } from "@/lib/supabase/tipos";
import { nombreCanal } from "../marketing/_lib/sitio";
import estilos from "./funnel.module.css";

export const metadata: Metadata = { title: "Funnel comercial" };
export const dynamic = "force-dynamic";

type LeadFunnel = Pick<
  Lead,
  "id" | "etapa_maxima" | "base_tratamiento" | "submission_id" | "canal" | "origen"
>;

type MovimientoIngreso = { id: string; monto: number; lead_id: string | null };
type MetricaFunnel = Pick<
  MetricaCampana,
  "impresiones" | "alcance" | "clics" | "gasto" | "leads" | "conversaciones" | "es_demo"
>;

export default async function FunnelComercial({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sesion = await exigirRol("admin", "asesor");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const esAdmin = sesion.perfil.rol === "admin";
  const supabase = await clienteServidor();

  const consultaLeads = supabase
    .from("leads")
    .select("id, etapa_maxima, base_tratamiento, submission_id, canal, origen")
    .eq("es_demo", false)
    .gte("created_at", inicioDelDia(rango.desde))
    .lte("created_at", finDelDia(rango.hasta));
  const consultaConversaciones = supabase
    .from("conversaciones")
    .select("id")
    .gte("created_at", inicioDelDia(rango.desde))
    .lte("created_at", finDelDia(rango.hasta));
  const consultaIngresos = esAdmin
    ? supabase
        .from("movimientos")
        .select("id, monto, lead_id")
        .eq("tipo", "ingreso")
        .eq("estatus", "pagado")
        .eq("es_demo", false)
        .not("lead_id", "is", null)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta)
    : Promise.resolve({ data: null, error: null });
  const consultaMetricas = esAdmin
    ? supabase
        .from("metricas_campana")
        .select("impresiones, alcance, clics, gasto, leads, conversaciones, es_demo")
        .eq("es_demo", false)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta)
    : Promise.resolve({ data: null, error: null });

  const [leadsRespuesta, conversacionesRespuesta, ingresosRespuesta, metricasRespuesta, google] = await Promise.all([
    consultaLeads,
    consultaConversaciones,
    consultaIngresos,
    consultaMetricas,
    esAdmin ? resumenGoogle(rango.desde, rango.hasta) : Promise.resolve(null),
  ]);

  const leadsDisponibles = !leadsRespuesta.error;
  const conversacionesDisponibles = !conversacionesRespuesta.error;
  const ingresosDisponibles = esAdmin && !ingresosRespuesta.error;
  const metricasDisponibles = esAdmin && !metricasRespuesta.error;
  const leads = ((leadsRespuesta.data ?? []) as LeadFunnel[]);
  const conversaciones = conversacionesRespuesta.data ?? [];
  const ingresos = ((ingresosRespuesta.data ?? []) as MovimientoIngreso[]);
  const idsCohorte = new Set(leads.map((lead) => lead.id));
  const ingresosCohorte = ingresos.filter((ingreso) => ingreso.lead_id && idsCohorte.has(ingreso.lead_id));
  const metricasReales = ((metricasRespuesta.data ?? []) as MetricaFunnel[]);
  const pauta = totalizarPauta(metricasReales);
  const sitio = google?.analitica ?? null;

  const formularios = leads.filter((lead) =>
    lead.base_tratamiento === "consentimiento_web"
    || Boolean(lead.submission_id)
    || lead.canal === "formulario"
    || lead.origen === "sitio-web",
  ).length;
  const etapas = leadsDisponibles ? embudoAcumulado(leads) : [];
  const cierres = leadsDisponibles
    ? etapas.find((etapa) => etapa.clave === "cerrado")?.total ?? 0
    : null;
  const ingresoTotal = ingresosCohorte.reduce((suma, movimiento) => suma + Number(movimiento.monto), 0);
  const canalPrincipal = sitio?.canales[0] ? nombreCanal(sitio.canales[0].nombre) : null;

  return (
    <>
      <Encabezado
        titulo="Funnel comercial"
        apoyo={esAdmin
          ? "Vista global, desde la adquisición hasta el ingreso cobrado."
          : "Tu cartera y el avance real de tus expedientes."}
        acciones={
          <>
            <Insignia solida color={esAdmin ? "#B42341" : "#255F72"}>{esAdmin ? "Global" : "Mi cartera"}</Insignia>
            <SelectorPeriodo actual={rango.clave} />
          </>
        }
      />

      <section aria-label="Entrada al funnel" className={estilos.flujo}>
        <Paso
          titulo="Impresiones"
          valor={metricasDisponibles ? pauta.impresiones : null}
          detalle={esAdmin
            ? metricasDisponibles
              ? metricasReales.length
                ? "Publicidad medida"
                : "Sin campañas con datos"
              : "Lectura no disponible"
            : "No se asignan por asesor"}
          icono="ojo"
          color="#4285F4"
        />
        <Paso
          titulo="Visitas al sitio"
          valor={esAdmin ? sitio?.sesiones ?? null : null}
          detalle={esAdmin
            ? canalPrincipal
              ?? (sitio && !sitio.canalesDisponibles
                ? "Canal no disponible"
                : google?.errorAnalitica
                  ? "Medición no disponible"
                  : "Medición pendiente")
            : "No se asignan por asesor"}
          icono="enlace"
          color="#34A853"
        />
        <article className={estilos.paso}>
          <CabeceraPaso titulo="Contactos" icono="conversacion" color="#25D366" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniDato
              etiqueta="Chats WhatsApp"
              valor={conversacionesDisponibles ? conversaciones.length : null}
            />
            <MiniDato
              etiqueta="Formularios"
              valor={leadsDisponibles ? formularios : null}
            />
          </div>
          <p className="mt-3 text-[0.7rem] leading-snug text-slate">Nuevos chats y formularios guardados.</p>
        </article>
        <Paso
          titulo="Solicitudes"
          valor={leadsDisponibles ? leads.length : null}
          detalle="Expedientes creados en el periodo"
          icono="bandeja"
          color="#FF4D6D"
          destacado
        />
      </section>

      {!esAdmin ? (
        <p className="mt-3 rounded-xl bg-sand-50 px-3.5 py-2.5 text-[0.72rem] leading-relaxed text-slate">
          Impresiones y visitas son globales y no se atribuyen a una persona; por eso permanecen vacías en tu vista.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
        <Tarjeta>
          <CabezaTarjeta titulo="Avance del expediente" apoyo="Cuántas solicitudes alcanzaron cada etapa." />
          <div className="mt-5">
            {etapas.length > 0
              ? <Embudo etapas={etapas.map((etapa) => ({ etiqueta: etapa.nombre, total: etapa.total, color: etapa.color }))} />
              : <EstadoSinDatos error={!leadsDisponibles} />}
          </div>
        </Tarjeta>

        <div className="grid content-start gap-3">
          <Resultado
            titulo="Trámites cerrados"
            valor={cierres === null ? "—" : numero(cierres)}
            detalle="Del grupo que entró en el periodo"
            icono="cheque"
            color="#2FB6A3"
          />
          <Resultado
            titulo="Pagos cobrados"
            valor={ingresosDisponibles ? numero(ingresosCohorte.length) : "—"}
            detalle={ingresosDisponibles ? `${dineroCorto(ingresoTotal)} cobrados en expedientes de esta cohorte` : "Visible para administración"}
            icono="monedas"
            color="#D9AE83"
          />
        </div>
      </div>
    </>
  );
}

function Paso({
  titulo,
  valor,
  detalle,
  icono,
  color,
  destacado = false,
}: {
  titulo: string;
  valor: number | null;
  detalle: string;
  icono: NombreIcono;
  color: string;
  destacado?: boolean;
}) {
  return (
    <article className={`${estilos.paso} ${destacado ? estilos.pasoDestacado : ""}`}>
      <CabeceraPaso titulo={titulo} icono={icono} color={color} />
      <p className={`${estilos.numero} cifra mt-5 text-ink`}>{valor === null ? "—" : numero(valor)}</p>
      <p className="mt-2 text-[0.72rem] leading-snug text-slate">{detalle}</p>
    </article>
  );
}

function CabeceraPaso({ titulo, icono, color }: { titulo: string; icono: NombreIcono; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-slate">{titulo}</h2>
      <span className="grid size-9 place-items-center rounded-xl" style={{ color, background: `${color}14` }}>
        <Icono nombre={icono} className="size-4" />
      </span>
    </div>
  );
}

function MiniDato({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  return (
    <div className="rounded-xl bg-mist p-3">
      <p className="cifra text-[1.55rem] font-semibold leading-none text-ink">{valor === null ? "—" : numero(valor)}</p>
      <p className="mt-1.5 text-[0.68rem] font-medium text-slate">{etiqueta}</p>
    </div>
  );
}

function Resultado({
  titulo,
  valor,
  detalle,
  icono,
  color,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  icono: NombreIcono;
  color: string;
}) {
  return (
    <article className={estilos.resultado}>
      <CabeceraPaso titulo={titulo} icono={icono} color={color} />
      <p className="cifra mt-5 text-[2.1rem] font-semibold leading-none tracking-tight text-ink">{valor}</p>
      <p className="mt-2 text-[0.72rem] text-slate">{detalle}</p>
    </article>
  );
}

function EstadoSinDatos({ error }: { error: boolean }) {
  return (
    <div className="rounded-2xl bg-mist px-5 py-10 text-center">
      <Icono nombre={error ? "alerta" : "embudo"} className="mx-auto size-7 text-slate" />
      <p className="mt-3 text-[0.84rem] font-semibold text-ink">
        {error ? "No pudimos leer el funnel" : "Sin solicitudes en el periodo"}
      </p>
      <p className="mt-1 text-[0.74rem] text-slate">
        {error ? "Intenta de nuevo más tarde." : "El recorrido aparecerá con la primera solicitud real."}
      </p>
    </div>
  );
}
