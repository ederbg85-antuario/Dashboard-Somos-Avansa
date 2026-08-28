import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Tarjeta, CabezaTarjeta } from "@/components/ui/Tarjeta";
import { Insignia, Punto } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Boton } from "@/components/ui/Boton";
import { Vacio } from "@/components/ui/Vacio";
import {
  CLASIFICACIONES, ESTATUS_DOCUMENTO, ETAPA, TIPOS_ACTIVIDAD,
} from "@/lib/constantes";
import { dinero, fecha, fechaHora, haceCuanto, iniciales } from "@/lib/formato";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";
import { equipo as cargarEquipo } from "@/lib/datos";
import type { Actividad, Documento, Lead } from "@/lib/supabase/tipos";
import { telefonoWhatsAppMexico } from "@/lib/telefono";
import { MoverEtapa } from "../MoverEtapa";
import { abrirExpedienteForm, cambiarDocumento } from "../acciones";
import { FormularioActividad, FormularioFicha } from "./FichaLead";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await clienteServidor();
  const { data } = await supabase.from("leads").select("nombre").eq("id", id).maybeSingle();
  return { title: data?.nombre ?? "Expediente" };
}

export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirSesion();
  const { id } = await params;
  const supabase = await clienteServidor();

  const [{ data: lead }, { data: actividades }, { data: documentos }, { data: nss }, equipo] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("actividades").select("*").eq("lead_id", id).order("ocurrio_en", { ascending: false }).limit(60),
    supabase.from("documentos").select("*").eq("lead_id", id).order("grupo").order("created_at"),
    supabase.rpc("leer_nss", { p_lead_id: id }),
    cargarEquipo(),
  ]);

  if (!lead) notFound();

  const l = lead as Lead;
  const bitacora = (actividades ?? []) as Actividad[];
  const expediente = (documentos ?? []) as Documento[];
  const porNombre = new Map(equipo.map((p) => [p.id, p]));
  const asesor = l.asesor_id ? porNombre.get(l.asesor_id) : null;

  const validados = expediente.filter((d) => d.estatus === "validado").length;
  const avance = expediente.length > 0 ? Math.round((validados / expediente.length) * 100) : 0;

  return (
    <>
      <div className="mb-4 flex items-center gap-2 text-[0.78rem] text-slate">
        <Link href="/crm" className="inline-flex items-center gap-1 font-semibold hover:text-coral">
          <Icono nombre="volver" className="size-3.5" />
          Pipeline
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink">{l.nombre}</span>
      </div>

      {/* ---------- cabecera del expediente ---------- */}
      <Tarjeta className="relative mb-5 animate-entrar overflow-hidden !ring-0 shadow-flotante">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[1.35rem] font-semibold tracking-tight text-ink">{l.nombre}</h1>
              <Insignia color={ETAPA[l.estado].color} solida>{ETAPA[l.estado].nombre}</Insignia>
              {l.clasificacion && (
                <Insignia color={CLASIFICACIONES[l.clasificacion].color}>
                  {CLASIFICACIONES[l.clasificacion].nombre}
                </Insignia>
              )}
              {l.es_demo && <Insignia color="#9AA5B1">demostración</Insignia>}
            </div>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-slate">
              <span className="inline-flex items-center gap-1">
                <Icono nombre="calendario" className="size-3.5" />
                Entró {haceCuanto(l.created_at)}
              </span>
              {l.estado_republica && (
                <span className="inline-flex items-center gap-1">
                  <Icono nombre="ubicacion" className="size-3.5" />
                  {l.estado_republica}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Icono nombre="enlace" className="size-3.5" />
                {l.origen ?? "sin origen"}
              </span>
              {asesor && (
                <span className="inline-flex items-center gap-1">
                  <span className="grid size-[18px] place-items-center rounded-full bg-deep text-[0.55rem] font-semibold text-white">
                    {iniciales(asesor.nombre)}
                  </span>
                  {asesor.nombre}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://wa.me/${telefonoWhatsAppMexico(l.telefono)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal px-4 text-[0.85rem] font-semibold text-white shadow-tarjeta transition hover:bg-teal-700"
            >
              <Icono nombre="whatsapp" className="size-4" />
              WhatsApp
            </a>
            <a
              href={`tel:${l.telefono.replace(/\D/g, "")}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[0.85rem] font-semibold text-ink ring-1 ring-hair transition hover:bg-mist"
            >
              <Icono nombre="telefono" className="size-4" />
              {l.telefono}
            </a>
            <div className="w-44"><MoverEtapa id={l.id} actual={l.estado} /></div>
          </div>
        </div>

        {l.estado === "descartado" && l.motivo_descarte && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-coral-50 px-3.5 py-2.5 text-[0.82rem] leading-relaxed text-coral-700">
            <Icono nombre="alerta" className="mt-px size-4 shrink-0" />
            <span>
              <strong className="font-semibold">Descartado:</strong> {l.motivo_descarte}
              {" · "}Llegó hasta {ETAPA[l.etapa_maxima].nombre.toLowerCase()}.
            </span>
          </p>
        )}

        {l.mensaje && (
          <blockquote className="mt-4 rounded-xl border-l-[3px] border-coral bg-mist px-4 py-3 text-[0.85rem] leading-relaxed text-ink">
            <p>“{l.mensaje}”</p>
            <footer className="mt-1.5 text-[0.72rem] text-slate">
              Lo que escribió en el formulario del sitio.
            </footer>
          </blockquote>
        )}
      </Tarjeta>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta
              titulo="Información del formulario"
              apoyo="Datos declarados por la persona. El NSS se descifra únicamente para perfiles autorizados y cada consulta queda auditada."
            />
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <DatoFormulario rotulo="NSS" valor={nss ?? "No disponible"} monoespaciado />
              <DatoFormulario
                rotulo="Crédito Infonavit activo"
                valor={l.credito_infonavit_activo === null ? "No indicado" : l.credito_infonavit_activo ? "Sí" : "No"}
              />
              <DatoFormulario
                rotulo="Buró de Crédito"
                valor={l.esta_en_buro_credito === null
                  ? "No indicado"
                  : l.esta_en_buro_credito
                    ? `Sí · ${l.institucion_buro ?? "institución no indicada"}`
                    : "No"}
              />
              <DatoFormulario
                rotulo="Ahorro para vivienda"
                valor={l.conoce_ahorro_vivienda === null
                  ? "No indicado"
                  : l.conoce_ahorro_vivienda
                    ? dinero(l.ahorro_vivienda_aprox ?? 0)
                    : "No lo conoce"}
              />
            </dl>
          </Tarjeta>

          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta
              titulo="Ficha del expediente"
              apoyo="Los datos con los que se decide si el trámite procede."
            />
            <div className="mt-4">
              <FormularioFicha lead={l} equipo={equipo} esAdmin={sesion.perfil.rol === "admin"} />
            </div>
          </Tarjeta>

          {/* ---------- checklist documental ---------- */}
          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta
              titulo="Expediente documental"
              apoyo={
                expediente.length > 0
                  ? `${validados} de ${expediente.length} documentos validados.`
                  : "Los 12 requisitos que publica avansa, listos para irse palomeando."
              }
              accion={
                expediente.length > 0 ? (
                  <span className="cifra text-[0.85rem] font-semibold text-ink">{avance} %</span>
                ) : undefined
              }
            />

            {expediente.length === 0 ? (
              <Vacio
                icono="carpeta"
                titulo="El expediente no está abierto"
                texto="Al abrirlo se crea el checklist con los requisitos personales y de vivienda que pide el Infonavit."
                accion={
                  <form action={abrirExpedienteForm}>
                    <input type="hidden" name="lead_id" value={l.id} />
                    <Boton type="submit" tono="coral" tamano="sm">
                      <Icono nombre="carpeta" className="size-4" />
                      Abrir expediente
                    </Boton>
                  </form>
                }
              />
            ) : (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist">
                  <div className="h-full rounded-full bg-teal transition-[width] duration-500"
                       style={{ width: `${avance}%` }} />
                </div>

                {(["personales", "vivienda"] as const).map((grupo) => {
                  const docs = expediente.filter((d) => d.grupo === grupo);
                  if (docs.length === 0) return null;
                  return (
                    <div key={grupo} className="mt-4">
                      <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-slate">
                        {grupo === "personales" ? "Documentos personales" : "Vivienda y proyecto"}
                      </h3>
                      <ul className="space-y-1.5">
                        {docs.map((d) => (
                          <li key={d.id}>
                            <form action={cambiarDocumento}
                                  className="flex items-center gap-2 rounded-xl bg-mist/70 px-3 py-2">
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="lead_id" value={l.id} />
                              <Punto color={ESTATUS_DOCUMENTO[d.estatus].color} />
                              <span className="min-w-0 flex-1 truncate text-[0.8rem] text-ink" title={d.nombre}>
                                {d.nombre}
                              </span>
                              <select
                                name="estatus"
                                defaultValue={d.estatus}
                                aria-label={`Estatus de ${d.nombre}`}
                                className="h-7 cursor-pointer rounded-lg bg-white px-2 text-[0.72rem] font-semibold text-slate ring-1 ring-hair transition hover:text-ink focus:outline-none focus:ring-2 focus:ring-coral"
                              >
                                {Object.entries(ESTATUS_DOCUMENTO).map(([clave, v]) => (
                                  <option key={clave} value={clave}>{v.nombre}</option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="grid size-7 shrink-0 place-items-center rounded-lg text-slate transition hover:bg-white hover:text-coral"
                                aria-label={`Guardar estatus de ${d.nombre}`}
                                title="Guardar"
                              >
                                <Icono nombre="cheque" className="size-3.5" grosor={2.2} />
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
          </Tarjeta>
        </div>

        {/* ---------- bitácora ---------- */}
        <div className="space-y-4">
          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta titulo="Registrar contacto"
                           apoyo="Cada llamada y cada WhatsApp, aquí. Es la memoria del expediente." />
            <div className="mt-4"><FormularioActividad leadId={l.id} /></div>
          </Tarjeta>

          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta titulo="Bitácora" apoyo={`${bitacora.length} movimientos registrados.`} />
            {bitacora.length === 0 ? (
              <Vacio icono="nota" titulo="Todavía sin movimientos"
                     texto="Los cambios de etapa se registran solos; las llamadas y notas las escribe el asesor." />
            ) : (
              <ol className="mt-4 space-y-0">
                {bitacora.map((a, i) => {
                  const tipo = TIPOS_ACTIVIDAD[a.tipo];
                  const autor = a.autor_id ? porNombre.get(a.autor_id) : null;
                  const ultimo = i === bitacora.length - 1;
                  return (
                    <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* hilo vertical que une la línea de tiempo */}
                      {!ultimo && (
                        <span className="absolute left-[13px] top-7 bottom-0 w-px bg-hair" aria-hidden="true" />
                      )}
                      <span className={`relative grid size-[26px] shrink-0 place-items-center rounded-full ${
                        a.tipo === "sistema" ? "bg-mist text-slate-400" : "bg-coral-50 text-coral"
                      }`}>
                        <Icono nombre={tipo.icono as "nota"} className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[0.82rem] font-medium leading-snug text-ink">{a.titulo}</p>
                        {a.detalle && (
                          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-slate">{a.detalle}</p>
                        )}
                        <p className="mt-1 text-[0.7rem] text-slate-400">
                          {tipo.nombre} · {fechaHora(a.ocurrio_en)}
                          {autor && ` · ${autor.nombre}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Tarjeta>

          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta titulo="Atribución" apoyo="De dónde vino esta persona." />
            <dl className="mt-3 space-y-2 text-[0.8rem]">
              <Renglon rotulo="Origen" valor={l.origen ?? "—"} />
              <Renglon rotulo="Canal" valor={l.canal ?? "—"} />
              {l.utm && Object.entries(l.utm).map(([k, v]) => (
                <Renglon key={k} rotulo={k.replace("utm_", "")} valor={String(v)} />
              ))}
              <Renglon rotulo="Recibido" valor={fechaHora(l.created_at)} />
              {l.cerrado_en && <Renglon rotulo="Cerrado" valor={fecha(l.cerrado_en)} />}
              <Renglon rotulo="Honorarios estimados"
                       valor={l.valor_estimado ? dinero(l.valor_estimado) : "—"} />
            </dl>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

function DatoFormulario({
  rotulo,
  valor,
  monoespaciado = false,
}: {
  rotulo: string;
  valor: string;
  monoespaciado?: boolean;
}) {
  return (
    <div className="rounded-xl bg-mist px-3.5 py-3">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {rotulo}
      </dt>
      <dd className={`mt-1 text-[0.86rem] font-semibold text-ink ${monoespaciado ? "font-mono tracking-[0.12em]" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

function Renglon({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2 last:border-0 last:pb-0">
      <dt className="shrink-0 capitalize text-slate">{rotulo}</dt>
      <dd className="cifra min-w-0 truncate text-right font-medium text-ink" title={valor}>{valor}</dd>
    </div>
  );
}
