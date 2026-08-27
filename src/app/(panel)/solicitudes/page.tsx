import Link from "next/link";
import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/Boton";
import { CLASIFICACIONES, ETAPA } from "@/lib/constantes";
import { dinero, fechaHora, haceCuanto, numero } from "@/lib/formato";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";
import { nombresDelEquipo } from "@/lib/datos";
import type { Lead } from "@/lib/supabase/tipos";
import { telefonoWhatsAppMexico } from "@/lib/telefono";

export const metadata: Metadata = { title: "Solicitudes" };
export const dynamic = "force-dynamic";

const FILTROS = [
  { clave: "sin-atender", etiqueta: "Nuevas" },
  { clave: "hoy",         etiqueta: "De hoy" },
  { clave: "sitio",       etiqueta: "Del sitio web" },
  { clave: "todas",       etiqueta: "Todas" },
] as const;

export default async function Solicitudes({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; q?: string }>;
}) {
  await exigirSesion();
  const { filtro = "sin-atender", q } = await searchParams;
  const supabase = await clienteServidor();

  let consulta = supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(120);

  if (filtro === "sin-atender") consulta = consulta.eq("estado", "nuevo");
  if (filtro === "sitio") consulta = consulta.eq("origen", "sitio-web");
  if (filtro === "hoy") consulta = consulta.gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  if (q) consulta = consulta.or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`);

  const [{ data, error }, equipo, { count: sinAtender }] = await Promise.all([
    consulta,
    nombresDelEquipo(),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("estado", "nuevo"),
  ]);

  const solicitudes = (data ?? []) as Lead[];

  return (
    <>
      <Encabezado
        titulo="Solicitudes"
        apoyo="Cada formulario llega asignado automáticamente. Un asesor ve sólo los suyos; los administradores supervisan todos."
        acciones={
          <BotonEnlace href="/crm?alta=1" tono="coral">
            <Icono nombre="mas" className="size-4" />
            Alta manual
          </BotonEnlace>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <Link
              key={f.clave}
              href={`/solicitudes?filtro=${f.clave}`}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.78rem] font-semibold transition ${
                filtro === f.clave
                  ? "bg-deep text-white"
                  : "bg-white text-slate ring-1 ring-hair hover:text-ink hover:ring-hair-fuerte"
              }`}
            >
              {f.etiqueta}
              {f.clave === "sin-atender" && (sinAtender ?? 0) > 0 && (
                <span className={`cifra rounded-md px-1.5 py-0.5 text-[0.68rem] ${
                  filtro === f.clave ? "bg-coral text-white" : "bg-coral-50 text-coral"
                }`}>
                  {numero(sinAtender ?? 0)}
                </span>
              )}
            </Link>
          ))}
        </div>
      </Encabezado>

      {error && (
        <Tarjeta className="mb-4 !bg-coral-50 ring-coral-100">
          <p className="text-[0.82rem] text-coral-700">
            No se pudieron leer las solicitudes: {error.message}
          </p>
        </Tarjeta>
      )}

      {solicitudes.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="bandeja"
            titulo={filtro === "sin-atender" ? "No hay formularios nuevos" : "Sin solicitudes con este filtro"}
            texto={
              filtro === "sin-atender"
                ? "Cuando llegue un formulario asignado a tu perfil, aparecerá aquí."
                : "Prueba con otro filtro o revisa el tablero del CRM."
            }
            accion={<BotonEnlace href="/solicitudes?filtro=todas" tamano="sm" tono="claro">Ver todas</BotonEnlace>}
          />
        </Tarjeta>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {solicitudes.map((s) => (
            <TarjetaSolicitud key={s.id} solicitud={s} asesor={s.asesor_id ? equipo.get(s.asesor_id)?.nombre : null} />
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function TarjetaSolicitud({ solicitud: s, asesor }: { solicitud: Lead; asesor?: string | null }) {
  const etapa = ETAPA[s.estado];
  const utm = s.utm ?? {};
  const campana = utm.utm_campaign;

  return (
    <Tarjeta className="flex flex-col">
      <CabezaTarjeta
        titulo={
          <Link href={`/crm/${s.id}`} className="hover:text-coral">{s.nombre}</Link>
        }
        apoyo={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span title={fechaHora(s.created_at)}>{haceCuanto(s.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{s.estado_republica ?? "sin estado"}</span>
          </span>
        }
        accion={<Insignia color={etapa.color}>{etapa.nombre}</Insignia>}
      />

      {/* Contacto: los dos botones que de verdad se usan, listos para tocar. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <a
          href={`https://wa.me/${telefonoWhatsAppMexico(s.telefono)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-50 px-2.5 text-[0.76rem] font-semibold text-teal-700 transition hover:bg-teal-100"
        >
          <Icono nombre="whatsapp" className="size-3.5" />
          {s.telefono}
        </a>
        {s.email && (
          <a
            href={`mailto:${s.email}`}
            className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg bg-mist px-2.5 text-[0.76rem] font-medium text-slate transition hover:text-ink"
          >
            <Icono nombre="correo" className="size-3.5 shrink-0" />
            <span className="truncate">{s.email}</span>
          </a>
        )}
      </div>

      {/* Lo que declaró en el formulario */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-hair pt-3">
        <Dato
          rotulo="Crédito Infonavit activo"
          valor={s.credito_infonavit_activo === null ? "No lo indicó" : s.credito_infonavit_activo ? "Sí" : "No"}
        />
        <Dato
          rotulo="Reportado en Buró"
          valor={s.esta_en_buro_credito === null ? "No lo indicó" : s.esta_en_buro_credito ? `Sí · ${s.institucion_buro ?? "sin institución"}` : "No"}
        />
        <Dato
          rotulo="Ahorro para vivienda"
          valor={s.conoce_ahorro_vivienda === null
            ? "No lo indicó"
            : s.conoce_ahorro_vivienda
              ? dinero(s.ahorro_vivienda_aprox ?? 0)
              : "No lo conoce"}
          className="col-span-2"
        />
      </dl>

      {s.mensaje && (
        <p className="mt-3 rounded-xl bg-mist px-3 py-2.5 text-[0.8rem] leading-relaxed text-ink">
          <span className="text-slate">“</span>{s.mensaje}<span className="text-slate">”</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-slate">
        <Insignia color={campana ? "#E63A58" : "#6B7785"}>
          <Icono nombre={campana ? "megafono" : "enlace"} className="size-3" />
          {campana ?? s.origen ?? "sin origen"}
        </Insignia>
        {s.clasificacion && (
          <Insignia color={CLASIFICACIONES[s.clasificacion].color}>
            {CLASIFICACIONES[s.clasificacion].nombre}
          </Insignia>
        )}
        {asesor && (
          <span className="inline-flex items-center gap-1">
            <Icono nombre="usuarios" className="size-3" />
            {asesor}
          </span>
        )}
      </div>

      {/* La asignación ya ocurrió en la base; aquí sólo se abre la ficha. */}
      <div className="mt-auto flex gap-2 border-t border-hair pt-4">
        <BotonEnlace href={`/crm/${s.id}`} tamano="sm" tono="oscuro" className="flex-1">
          Abrir expediente
        </BotonEnlace>
        <BotonEnlace href={`/crm/${s.id}`} tamano="sm" tono="claro" aria-label="Ver ficha">
          <Icono nombre="ojo" className="size-4" />
        </BotonEnlace>
      </div>
    </Tarjeta>
  );
}

function Dato({ rotulo, valor, className = "" }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-slate-400">{rotulo}</dt>
      <dd className="cifra mt-0.5 text-[0.82rem] font-medium text-ink">{valor}</dd>
    </div>
  );
}
