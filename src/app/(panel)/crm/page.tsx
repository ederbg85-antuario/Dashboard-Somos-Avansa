import Link from "next/link";
import type { Metadata } from "next";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Punto } from "@/components/ui/Insignia";
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
      <section className="relative mb-5 animate-entrar overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-deep via-deep-700 to-[#195063] p-5 text-white shadow-flotante sm:p-6">
        <span className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-coral/20 blur-3xl" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-teal/20 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-coral-100">
              <span className="grid size-7 place-items-center rounded-lg bg-white/10">
                <Icono nombre="embudo" className="size-3.5" />
              </span>
              CRM avansa
            </p>
            <h1 className="mt-3 text-[1.6rem] font-semibold leading-tight tracking-[-0.035em] sm:text-[1.85rem]">
              Pipeline comercial
            </h1>
            <p className="mt-1.5 max-w-xl text-[0.8rem] leading-relaxed text-white/65">
              Consulta el avance del equipo y mueve cada expediente de etapa. Todos los cambios quedan registrados en su bitácora.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <BotonEnlace href="/crm/lista" tono="claro" className="!border-0 !bg-white/10 !text-white !ring-0 backdrop-blur hover:!bg-white/20">
              <Icono nombre="reporte" className="size-4" />
              Ver lista
            </BotonEnlace>
            <BotonEnlace href="/crm/nuevo" tono="coral" className="shadow-elevada">
              <Icono nombre="mas" className="size-4" />
              Alta manual
            </BotonEnlace>
          </div>
        </div>

        <div className="relative mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filtro href="/crm" activo={!asesor && !clase && !q}>Todo</Filtro>
            <Filtro href="/crm?asesor=mios" activo={asesor === "mios"}>Mis expedientes</Filtro>
            <Filtro href="/crm?asesor=sin-dueno" activo={asesor === "sin-dueno"}>Sin responsable</Filtro>
            <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
            {(["A", "B", "C", "D"] as const).map((g) => (
              <Filtro key={g} href={`/crm?clase=${g}`} activo={clase === g} color={CLASIFICACIONES[g].color}>
                {g}
              </Filtro>
            ))}
          </div>

          <form action="/crm" className="relative w-full sm:max-w-xs">
            {asesor && <input type="hidden" name="asesor" value={asesor} />}
            {clase && <input type="hidden" name="clase" value={clase} />}
            <label htmlFor="buscar-pipeline" className="sr-only">Buscar expediente</label>
            <Icono nombre="buscar" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/45" />
            <input
              id="buscar-pipeline"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Nombre, teléfono o correo"
              className="h-10 w-full rounded-xl bg-white/10 pl-9 pr-3 text-[0.78rem] text-white shadow-inner outline-none backdrop-blur placeholder:text-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/25"
            />
          </form>
        </div>

        <div className="relative mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Cifra rotulo="Expedientes activos" valor={numero(abiertos.length)} icono="usuarios" acento="coral" />
          <Cifra rotulo="Valor en proceso" valor={dineroCorto(valorAbierto)} icono="monedas" acento="teal" />
          <Cifra rotulo="Proyección ponderada" valor={dineroCorto(valorPonderado)}
                 ayuda="Valor × probabilidad de cada etapa" icono="reporte" acento="sand" />
          <Cifra rotulo="Ganados / descartados"
                 valor={`${numero(cerrados.length)} / ${numero(descartados.length)}`} icono="cheque" acento="coral" />
        </div>
      </section>

      {abiertos.length === 0 ? (
        <Tarjeta className="!ring-0 shadow-elevada">
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
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7">
          <div className="flex min-w-max items-stretch gap-3.5">
            {ETAPAS_TABLERO.map((etapa) => {
              const columna = abiertos.filter((l) => l.estado === etapa.clave);
              const valor = columna.reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);

              return (
                <section key={etapa.clave} className="flex w-[18rem] shrink-0 animate-entrar flex-col rounded-[1.35rem] bg-white/70 p-2.5 shadow-tarjeta backdrop-blur-sm">
                  <header className="relative mb-2 overflow-hidden rounded-2xl bg-white px-3 py-3 shadow-tarjeta">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Punto color={etapa.color} />
                        <span className="truncate text-[0.82rem] font-semibold text-ink">{etapa.nombre}</span>
                        <span className="cifra rounded-lg bg-mist px-1.5 py-0.5 text-[0.66rem] font-semibold text-slate">
                          {numero(columna.length)}
                        </span>
                      </span>
                      <span className="cifra shrink-0 text-[0.7rem] font-semibold text-deep">{dineroCorto(valor)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[0.66rem] leading-snug text-slate-400">{etapa.descripcion}</p>
                  </header>

                  <div className="flex flex-1 flex-col gap-2 rounded-2xl bg-mist/70 p-1.5 shadow-inner">
                    {columna.length === 0 ? (
                      <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-hair-fuerte/70 px-3 py-5 text-center">
                        <p className="text-[0.7rem] text-slate-400">Sin expedientes en esta etapa</p>
                      </div>
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
    <article className="group rounded-2xl bg-white p-3.5 shadow-tarjeta transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-elevada">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/crm/${l.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-[0.84rem] font-semibold leading-tight text-ink transition group-hover:text-coral">
            {l.nombre}
          </span>
          <span className="cifra mt-0.5 block text-[0.7rem] text-slate">{l.telefono}</span>
        </Link>
        {l.clasificacion && (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-lg text-[0.65rem] font-bold text-white shadow-tarjeta"
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
        <p className={`mt-2.5 flex items-start gap-1.5 rounded-xl px-2.5 py-2 text-[0.7rem] leading-snug ${
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
            className="grid size-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-deep to-deep-700 text-[0.6rem] font-semibold text-white shadow-tarjeta"
            title={asesor.nombre}
          >
            {iniciales(asesor.nombre)}
          </span>
        ) : (
          <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-mist text-slate-400 shadow-inner" title="Sin dueño">
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
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <Tarjeta className="shadow-elevada">
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

      <Tarjeta className="shadow-elevada">
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
      className={`inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[0.74rem] font-semibold transition-all duration-200 ${
        activo
          ? "bg-white text-deep shadow-elevada"
          : "bg-white/[0.08] text-white/65 hover:bg-white/15 hover:text-white"
      }`}
    >
      {color && <Punto color={color} />}
      {children}
    </Link>
  );
}

function Cifra({
  rotulo,
  valor,
  ayuda,
  icono,
  acento,
}: {
  rotulo: string;
  valor: string;
  ayuda?: string;
  icono: "usuarios" | "monedas" | "reporte" | "cheque";
  acento: "coral" | "teal" | "sand";
}) {
  const acentos = {
    coral: "bg-coral/20 text-coral-100",
    teal: "bg-teal/20 text-teal-100",
    sand: "bg-sand/20 text-sand-100",
  };

  return (
    <div className="rounded-2xl bg-white/[0.09] px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur" title={ayuda}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.63rem] font-semibold uppercase tracking-[0.08em] text-white/50">{rotulo}</p>
          <p className="cifra mt-1.5 truncate text-[1.2rem] font-semibold leading-none tracking-tight text-white">{valor}</p>
        </div>
        <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${acentos[acento]}`}>
          <Icono nombre={icono} className="size-4" />
        </span>
      </div>
    </div>
  );
}
