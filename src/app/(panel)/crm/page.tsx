import Link from "next/link";
import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia, Punto } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { BotonEnlace } from "@/components/ui/Boton";
import { Vacio } from "@/components/ui/Vacio";
import { CLASIFICACIONES, ETAPA, ETAPAS_TABLERO } from "@/lib/constantes";
import { dineroCorto, fecha, iniciales, iso, numero } from "@/lib/formato";
import { nombresDelEquipo, pipelineCompleto, type LeadLigero } from "@/lib/datos";
import { exigirSesion } from "@/lib/supabase/sesion";
import type { Perfil } from "@/lib/supabase/tipos";
import { MoverEtapa } from "./MoverEtapa";

export const metadata: Metadata = { title: "CRM" };
export const dynamic = "force-dynamic";

export default async function TableroCRM({
  searchParams,
}: {
  searchParams: Promise<{ asesor?: string; clase?: string; q?: string }>;
}) {
  const sesion = await exigirSesion();
  const { asesor, clase, q } = await searchParams;

  const [todos, equipo] = await Promise.all([pipelineCompleto(), nombresDelEquipo()]);

  const filtrados = todos.filter((l) => {
    if (asesor === "mios" && l.asesor_id !== sesion.usuarioId) return false;
    if (asesor === "sin-dueno" && l.asesor_id) return false;
    if (asesor && !["mios", "sin-dueno"].includes(asesor) && l.asesor_id !== asesor) return false;
    if (clase && l.clasificacion !== clase) return false;
    if (q) {
      const aguja = q.toLowerCase();
      const pajar = `${l.nombre} ${l.telefono} ${l.email ?? ""}`.toLowerCase();
      if (!pajar.includes(aguja)) return false;
    }
    return true;
  });

  const abiertos = filtrados.filter((l) => l.estado !== "cerrado" && l.estado !== "descartado");
  const cerrados = filtrados.filter((l) => l.estado === "cerrado");
  const descartados = filtrados.filter((l) => l.estado === "descartado");

  const valorAbierto = abiertos.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
  const valorPonderado = abiertos.reduce(
    (s, l) => s + ((Number(l.valor_estimado) || 0) * (l.probabilidad ?? 0)) / 100, 0);

  const parametros = new URLSearchParams();
  if (asesor) parametros.set("asesor", asesor);
  if (clase) parametros.set("clase", clase);
  if (q) parametros.set("q", q);

  return (
    <>
      <Encabezado
        titulo="Pipeline"
        apoyo="Cada columna es una etapa del proceso de avansa. Mueve un expediente con el selector de su tarjeta; el cambio queda en la bitácora."
        acciones={
          <BotonEnlace href="/crm/nuevo" tono="coral">
            <Icono nombre="mas" className="size-4" />
            Alta manual
          </BotonEnlace>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Filtro href="/crm" activo={!asesor && !clase && !q}>Todo el pipeline</Filtro>
          <Filtro href="/crm?asesor=mios" activo={asesor === "mios"}>Míos</Filtro>
          <Filtro href="/crm?asesor=sin-dueno" activo={asesor === "sin-dueno"}>Sin dueño</Filtro>
          <span className="mx-1 h-5 w-px bg-hair" aria-hidden="true" />
          {(["A", "B", "C", "D"] as const).map((g) => (
            <Filtro key={g} href={`/crm?clase=${g}`} activo={clase === g} color={CLASIFICACIONES[g].color}>
              {g}
            </Filtro>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra rotulo="Expedientes abiertos" valor={numero(abiertos.length)} />
          <Cifra rotulo="Valor del pipeline" valor={dineroCorto(valorAbierto)} />
          <Cifra rotulo="Valor ponderado" valor={dineroCorto(valorPonderado)}
                 ayuda="Valor × probabilidad de cada etapa" />
          <Cifra rotulo="Cerrados / descartados"
                 valor={`${numero(cerrados.length)} / ${numero(descartados.length)}`} />
        </div>
      </Encabezado>

      {abiertos.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="embudo"
            titulo="No hay expedientes con este filtro"
            texto="Quita el filtro o da de alta un expediente a mano si el contacto llegó por teléfono."
            accion={<BotonEnlace href="/crm" tamano="sm" tono="claro">Ver todo el pipeline</BotonEnlace>}
          />
        </Tarjeta>
      ) : (
        /* Las columnas viven en su propio scroll horizontal: la página nunca
           se desplaza de lado, sólo el tablero. */
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-7 sm:px-7">
          <div className="flex min-w-max gap-3">
            {ETAPAS_TABLERO.map((etapa) => {
              const columna = abiertos.filter((l) => l.estado === etapa.clave);
              const valor = columna.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);

              return (
                <section key={etapa.clave} className="flex w-[17.5rem] shrink-0 flex-col">
                  <header className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
                    <span className="flex items-center gap-2">
                      <Punto color={etapa.color} />
                      <span className="text-[0.82rem] font-semibold text-ink">{etapa.nombre}</span>
                      <span className="cifra rounded-md bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold text-slate ring-1 ring-hair">
                        {numero(columna.length)}
                      </span>
                    </span>
                    <span className="cifra text-[0.7rem] text-slate">{dineroCorto(valor)}</span>
                  </header>

                  <p className="mb-2 px-1 text-[0.68rem] leading-snug text-slate-400">{etapa.descripcion}</p>

                  <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-white/60 p-2 ring-1 ring-hair/70">
                    {columna.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[0.74rem] text-slate-400">
                        Nada en esta etapa.
                      </p>
                    ) : (
                      columna.map((l) => (
                        <TarjetaLead key={l.id} lead={l} asesor={l.asesor_id ? equipo.get(l.asesor_id) : undefined} />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {(cerrados.length > 0 || descartados.length > 0) && (
        <Terminales cerrados={cerrados} descartados={descartados} parametros={parametros.toString()} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function TarjetaLead({ lead: l, asesor }: { lead: LeadLigero; asesor?: Perfil }) {
  const vencida = l.fecha_proxima_accion !== null && l.fecha_proxima_accion < iso();

  return (
    <article className="rounded-xl bg-white p-3 ring-1 ring-hair shadow-tarjeta transition hover:shadow-elevada">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/crm/${l.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-[0.83rem] font-semibold leading-tight text-ink hover:text-coral">
            {l.nombre}
          </span>
          <span className="cifra mt-0.5 block text-[0.7rem] text-slate">{l.telefono}</span>
        </Link>
        {l.clasificacion && (
          <span
            className="grid size-5 shrink-0 place-items-center rounded-md text-[0.65rem] font-bold text-white"
            style={{ background: CLASIFICACIONES[l.clasificacion].color }}
            title={CLASIFICACIONES[l.clasificacion].nombre}
          >
            {l.clasificacion}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.7rem] text-slate">
        {l.valor_estimado ? (
          <span className="cifra font-semibold text-ink">{dineroCorto(l.valor_estimado)}</span>
        ) : (
          <span className="text-slate-400">sin valor</span>
        )}
        {l.estado_republica && <><span aria-hidden="true">·</span><span className="truncate">{l.estado_republica}</span></>}
      </div>

      {l.proxima_accion && (
        <p className={`mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[0.7rem] leading-snug ${
          vencida ? "bg-coral-50 text-coral-700" : "bg-mist text-slate"
        }`}>
          <Icono nombre={vencida ? "alerta" : "reloj"} className="mt-px size-3 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">{l.proxima_accion}</span>
            {l.fecha_proxima_accion && (
              <span className="cifra font-semibold">{fecha(l.fecha_proxima_accion)}</span>
            )}
          </span>
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        {asesor ? (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-deep text-[0.6rem] font-semibold text-white"
            title={asesor.nombre}
          >
            {iniciales(asesor.nombre)}
          </span>
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-mist text-slate-400" title="Sin dueño">
            <Icono nombre="usuarios" className="size-3" />
          </span>
        )}
        <MoverEtapa id={l.id} actual={l.estado} compacto />
      </div>
    </article>
  );
}

function Terminales({
  cerrados, descartados, parametros,
}: { cerrados: LeadLigero[]; descartados: LeadLigero[]; parametros: string }) {
  const total = cerrados.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);
  const q = parametros ? `?${parametros}` : "";

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <Tarjeta>
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
            <Punto color={ETAPA.cerrado.color} />
            Cerrados
            <span className="cifra text-slate">{numero(cerrados.length)}</span>
          </h2>
          <span className="cifra text-[0.85rem] font-semibold text-teal-700">{dineroCorto(total)}</span>
        </div>
        <ul className="mt-3 divide-y divide-hair">
          {cerrados.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
              <Link href={`/crm/${l.id}`} className="truncate text-[0.8rem] font-medium text-ink hover:text-coral">
                {l.nombre}
              </Link>
              <span className="cifra shrink-0 text-[0.75rem] text-slate">
                {l.cerrado_en ? fecha(l.cerrado_en) : "—"}
              </span>
            </li>
          ))}
        </ul>
        {cerrados.length > 5 && (
          <Link href={`/crm/lista${q}`} className="mt-3 inline-block text-[0.76rem] font-semibold text-coral hover:underline">
            Ver los {numero(cerrados.length)} cerrados
          </Link>
        )}
      </Tarjeta>

      <Tarjeta>
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-[0.9rem] font-semibold text-ink">
            <Punto color={ETAPA.descartado.color} />
            Descartados
            <span className="cifra text-slate">{numero(descartados.length)}</span>
          </h2>
        </div>
        <ul className="mt-3 divide-y divide-hair">
          {descartados.slice(0, 5).map((l) => (
            <li key={l.id} className="py-2 first:pt-0">
              <Link href={`/crm/${l.id}`} className="block truncate text-[0.8rem] font-medium text-ink hover:text-coral">
                {l.nombre}
              </Link>
              <span className="block truncate text-[0.72rem] text-slate">
                Salió en {ETAPA[l.etapa_maxima].nombre.toLowerCase()}
              </span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}

function Filtro({
  href, activo, children, color,
}: { href: string; activo: boolean; children: React.ReactNode; color?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[0.78rem] font-semibold transition ${
        activo ? "bg-deep text-white" : "bg-white text-slate ring-1 ring-hair hover:text-ink hover:ring-hair-fuerte"
      }`}
    >
      {color && <Punto color={activo ? "#fff" : color} />}
      {children}
    </Link>
  );
}

function Cifra({ rotulo, valor, ayuda }: { rotulo: string; valor: string; ayuda?: string }) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-hair shadow-tarjeta" title={ayuda}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-slate">{rotulo}</p>
      <p className="cifra mt-1 text-[1.15rem] font-semibold leading-none text-ink">{valor}</p>
    </div>
  );
}
