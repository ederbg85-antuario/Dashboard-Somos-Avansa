"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { Boton } from "@/components/ui/Boton";
import { Vacio } from "@/components/ui/Vacio";
import { ZONA } from "@/lib/formato";
import type { RolUsuario } from "@/lib/supabase/tipos";

/**
 * La bandeja, con la forma de una aplicación de mensajería: lista a la
 * izquierda, conversación a la derecha, y cada columna con su propio scroll.
 *
 * Refresca sola. Chatwoot tiene websockets, pero abrirlos exigiría repartir
 * credenciales de Chatwoot a cada navegador — justo lo que este diseño evita.
 * Un sondeo cada pocos segundos cuesta una consulta ridícula para un equipo
 * de tres y mantiene la credencial del lado del servidor.
 */

export type Fila = {
  id: number;
  nombre: string;
  telefono: string | null;
  avance: string;
  ultimoEn: string | null;
  entranteSinResponder: boolean;
  sinLeer: number;
  asignadoA: string | null;
  asignadoNombre: string | null;
  mia: boolean;
  libre: boolean;
};

export type Mensaje = {
  id: number;
  texto: string;
  mio: boolean;
  entrante: boolean;
  en: string | null;
  autor: string | null;
  adjuntos: { url: string; tipo: string }[];
};

type Companero = { id: string; nombre: string; rol: RolUsuario };

const CADA_LISTA = 8000;
const CADA_HILO = 6000;
const SIN_MENSAJES: Mensaje[] = [];

const relojFmt = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit", minute: "2-digit", timeZone: ZONA,
});
const diaFmt = new Intl.DateTimeFormat("es-MX", {
  weekday: "long", day: "numeric", month: "long", timeZone: ZONA,
});
const claveDiaFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONA,
});

const reloj = (iso: string | null) => (iso ? relojFmt.format(new Date(iso)) : "");
const dia = (iso: string | null) => (iso ? diaFmt.format(new Date(iso)) : "");

/** «14:32» si es de hoy, «mar 19» si no: lo que importa en una lista larga. */
function cuando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = claveDiaFmt.format(d) === claveDiaFmt.format(hoy);
  if (mismoDia) return reloj(iso);
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric", month: "short", timeZone: ZONA,
  }).format(d);
}

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase() || "?";
}

export function Bandeja({
  inicial, ocultas: ocultasIniciales, rol, equipo, modoDemo = false, mensajesDemo = SIN_MENSAJES,
}: {
  inicial: Fila[];
  ocultas: number;
  rol: RolUsuario;
  equipo: Companero[];
  modoDemo?: boolean;
  mensajesDemo?: Mensaje[];
}) {
  const [filas, setFilas] = useState<Fila[]>(inicial);
  const [ocultas, setOcultas] = useState(ocultasIniciales);
  const [abierta, setAbierta] = useState<number | null>(modoDemo ? inicial[0]?.id ?? null : null);
  const [mensajes, setMensajes] = useState<Mensaje[]>(modoDemo ? mensajesDemo : SIN_MENSAJES);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"mias" | "todas">(rol === "admin" ? "todas" : "mias");
  const [busca, setBusca] = useState("");

  const finDelHilo = useRef<HTMLDivElement>(null);
  const cajaTexto = useRef<HTMLTextAreaElement>(null);

  const conversacion = filas.find((f) => f.id === abierta) ?? null;
  const atendibles = useMemo(() => equipo.filter((p) => p.rol === "asesor"), [equipo]);

  // ---------- datos ----------

  const traerLista = useCallback(async () => {
    if (modoDemo) return;
    try {
      const r = await fetch("/api/conversaciones", { cache: "no-store" });
      // Una sesión vencida tiene que decirse. Si no, el sondeo seguiría
      // fallando en silencio y la pantalla mostraría mensajes viejos como si
      // estuvieran al día — que en atención a leads es peor que un error.
      if (r.status === 401) {
        setAviso("Tu sesión expiró. Vuelve a entrar para seguir atendiendo.");
        return;
      }
      if (!r.ok) return;
      const d = await r.json();
      setFilas(d.filas as Fila[]);
      setOcultas(d.ocultas as number);
    } catch {
      // Un sondeo que falla no merece molestar a nadie: el siguiente arregla.
    }
  }, [modoDemo]);

  const traerHilo = useCallback(async (id: number) => {
    if (modoDemo) {
      setMensajes(mensajesDemo);
      setCargandoHilo(false);
      return;
    }
    try {
      const r = await fetch(`/api/conversaciones/${id}/mensajes`, { cache: "no-store" });
      if (r.status === 401) {
        setAviso("Tu sesión expiró. Vuelve a entrar para seguir atendiendo.");
        return;
      }
      if (!r.ok) {
        // 404 aquí significa que dejó de ser suya mientras la tenía abierta:
        // alguien más la tomó, o un admin se la reasignó.
        if (r.status === 404) {
          setAviso("Ese chat ya no está en tu bandeja de entrada.");
          setAbierta(null);
          setMensajes([]);
        }
        return;
      }
      const d = await r.json();
      setMensajes(d.mensajes as Mensaje[]);
    } catch {
      /* el siguiente sondeo lo intenta otra vez */
    } finally {
      setCargandoHilo(false);
    }
  }, [mensajesDemo, modoDemo]);

  useEffect(() => {
    if (modoDemo) return;
    const t = setInterval(traerLista, CADA_LISTA);
    return () => clearInterval(t);
  }, [modoDemo, traerLista]);

  // El efecto sólo mantiene el hilo al día. La primera carga la dispara el
  // clic, unas líneas más abajo: abrir una conversación es una acción de la
  // persona, no algo que haya que deducir después mirando el estado.
  useEffect(() => {
    if (modoDemo || abierta === null) return;
    const t = setInterval(() => traerHilo(abierta), CADA_HILO);
    return () => clearInterval(t);
  }, [abierta, modoDemo, traerHilo]);

  function abrir(id: number | null) {
    setAbierta(id);
    setAviso(null);
    if (modoDemo) {
      setMensajes(id === null ? [] : mensajesDemo);
      setCargandoHilo(false);
      return;
    }
    setMensajes([]);
    setCargandoHilo(id !== null);
    if (id !== null) traerHilo(id);
  }

  useEffect(() => {
    finDelHilo.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  // ---------- acciones ----------

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || abierta === null || enviando) return;
    if (modoDemo) {
      setAviso("Esta es una vista demo. El envío se activará al conectar el número oficial.");
      return;
    }

    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch(`/api/conversaciones/${abierta}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: limpio }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setAviso(d.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      setTexto("");
      await Promise.all([traerHilo(abierta), traerLista()]);
      cajaTexto.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  async function asignar(id: number, a: string) {
    if (modoDemo) return;
    setAviso(null);
    const r = await fetch(`/api/conversaciones/${id}/asignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setAviso(d.error ?? "No se pudo cambiar la asignación.");
    }
    await traerLista();
  }

  // ---------- lista ----------

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtro === "mias" && !f.mia) return false;
      if (!q) return true;
      return (
        f.nombre.toLowerCase().includes(q) ||
        (f.telefono ?? "").includes(q) ||
        f.avance.toLowerCase().includes(q)
      );
    });
  }, [filas, filtro, busca]);

  const cuenta = useMemo(() => ({
    mias: filas.filter((f) => f.mia).length,
    todas: filas.length,
  }), [filas]);

  const PESTANAS = rol === "admin"
    ? [{ clave: "todas" as const, etiqueta: "Todas", n: cuenta.todas }]
    : [{ clave: "mias" as const, etiqueta: "Asignadas a mí", n: cuenta.mias }];

  return (
    <div className={`${
      modoDemo
        ? "h-[calc(100dvh-19.5rem)] min-h-[27rem]"
        : "h-[calc(100dvh-15rem)] min-h-[32rem]"
    } animate-entrar overflow-hidden rounded-[1.75rem] bg-white shadow-flotante`}>
      <div className="grid h-full lg:grid-cols-[20rem_1fr] xl:grid-cols-[22rem_1fr]">

        {/* ---------- columna izquierda: la lista ---------- */}
        <aside
          className={`relative flex h-full min-h-0 flex-col bg-paper lg:shadow-[8px_0_24px_-22px_rgba(15,45,61,0.45)] ${
            abierta !== null ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 bg-gradient-to-br from-coral-50 via-white to-teal-50 p-4 pb-3 shadow-[0_10px_24px_-24px_rgba(15,45,61,0.5)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-coral">Atención</p>
                <p className="mt-0.5 text-[0.9rem] font-semibold tracking-tight text-deep">Mensajes recientes</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[0.64rem] font-semibold text-teal-700 shadow-tarjeta">
                <span className="size-1.5 rounded-full bg-teal shadow-[0_0_0_3px_rgba(47,182,163,0.12)]" />
                En línea
              </span>
            </div>
            <label className="relative block">
              <span className="sr-only">Buscar en la bandeja</span>
              <Icono
                nombre="buscar"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar nombre o teléfono"
                className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[0.8rem] text-ink shadow-tarjeta placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-coral/35"
              />
            </label>

            <div className="mt-2.5 flex rounded-xl bg-deep/[0.04] p-1">
              {PESTANAS.map((p) => (
                <button
                  key={p.clave}
                  type="button"
                  onClick={() => setFiltro(p.clave)}
                  aria-pressed={filtro === p.clave}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[0.72rem] font-semibold transition-all duration-200 ${
                    filtro === p.clave
                      ? "bg-white text-deep shadow-tarjeta"
                      : "text-slate hover:text-ink"
                  }`}
                >
                  {p.etiqueta}
                  <span className={filtro === p.clave ? "ml-1 opacity-70" : "ml-1 text-slate-400"}>
                    {p.n}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {visibles.length === 0 ? (
              <Vacio
                icono="conversacion"
                titulo={
                  filtro === "mias" ? "No tienes chats asignados" : "La bandeja está al día"
                }
                texto={
                  filtro === "mias"
                    ? "El reparto automático colocará aquí únicamente los mensajes que te correspondan."
                    : "En cuanto alguien escriba al WhatsApp de avansa, su chat aparecerá aquí y se repartirá automáticamente."
                }
              />
            ) : (
              <ul className="space-y-1" aria-label="Mensajes de la bandeja">
                {visibles.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => abrir(f.id)}
                      aria-label={`Abrir mensajes de ${f.nombre}`}
                      aria-current={f.id === abierta ? "true" : undefined}
                      className={`group relative flex w-full items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-all duration-200 ${
                        f.id === abierta
                          ? "bg-white shadow-elevada"
                          : "hover:bg-white hover:shadow-tarjeta"
                      }`}
                    >
                      {f.id === abierta && (
                        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-coral" aria-hidden="true" />
                      )}
                      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-[0.7rem] font-bold shadow-tarjeta transition-transform duration-200 group-hover:-translate-y-0.5 ${
                        f.id === abierta
                          ? "bg-gradient-to-br from-coral to-coral-700 text-white"
                          : "bg-gradient-to-br from-peach to-sand-100 text-deep"
                      }`}>
                        {iniciales(f.nombre)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[0.84rem] font-semibold text-ink">
                            {f.nombre}
                          </span>
                          <span
                            suppressHydrationWarning
                            className="shrink-0 text-[0.68rem] text-slate-400"
                          >
                            {cuando(f.ultimoEn)}
                          </span>
                        </span>

                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-[0.78rem] leading-snug text-slate">
                            {f.avance}
                          </span>
                          {f.sinLeer > 0 ? (
                            <span
                              className="cifra ml-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-coral px-1.5 py-0.5 text-[0.58rem] font-bold text-white shadow-tarjeta"
                              title={`${f.sinLeer} sin leer`}
                            >
                              {f.sinLeer > 99 ? "99+" : f.sinLeer}
                            </span>
                          ) : f.entranteSinResponder ? (
                            <span
                              className="ml-auto size-2 shrink-0 rounded-full bg-coral shadow-[0_0_0_3px_rgba(255,77,109,0.12)]"
                              title="Esperando respuesta"
                            />
                          ) : null}
                        </span>

                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {f.libre ? (
                            <span className="rounded-full bg-sand-50 px-2 py-0.5 text-[0.64rem] font-semibold text-[#B9884F]">
                              Sin asesor disponible
                            </span>
                          ) : f.mia ? (
                            <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[0.64rem] font-semibold text-coral-700">
                              Asignada a ti
                            </span>
                          ) : (
                            <span className="rounded-full bg-mist px-2 py-0.5 text-[0.64rem] font-semibold text-slate">
                              {f.asignadoNombre}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ocultas > 0 && (
            <p className="shrink-0 bg-deep/[0.035] px-4 py-2.5 text-[0.68rem] leading-snug text-slate-400">
              {ocultas === 1
                ? "Hay 1 chat más, atendido por otra persona."
                : `Hay ${ocultas} chats más, atendidos por otras personas.`}
            </p>
          )}
        </aside>

        {/* ---------- columna derecha: la conversación ---------- */}
        <section className={`h-full min-h-0 bg-mist/60 p-2 sm:p-3 ${abierta === null ? "hidden lg:block" : "block"}`}>
          {conversacion === null ? (
            <div className="grid h-full place-items-center rounded-[1.35rem] bg-white shadow-tarjeta">
              <div className="max-w-sm px-6 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-coral-50 to-teal-50 text-coral shadow-elevada">
                  <Icono nombre="bandeja" className="size-7" />
                </span>
                <h2 className="mt-4 text-[1rem] font-semibold tracking-tight text-ink">Elige un mensaje</h2>
                <p className="mt-1 text-[0.78rem] leading-relaxed text-slate">
                  Selecciona un contacto para abrir el hilo y consultar su atención.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] bg-white shadow-elevada">
              <header className="flex shrink-0 items-center gap-3 border-b border-[#d7e4df] bg-[#f0f2f5] px-4 py-3">
                <button
                  type="button"
                  onClick={() => abrir(null)}
                  className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate hover:bg-mist lg:hidden"
                  aria-label="Volver a la lista"
                >
                  <Icono nombre="volver" className="size-4" />
                </button>

                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#008069] text-[0.7rem] font-bold text-white shadow-[0_2px_6px_rgba(0,128,105,0.22)]">
                  {iniciales(conversacion.nombre)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[0.88rem] font-semibold text-ink">
                      {conversacion.nombre}
                    </p>
                    {modoDemo && (
                      <span className="shrink-0 rounded-full bg-[#d9fdd3] px-2 py-0.5 text-[0.61rem] font-bold uppercase tracking-[0.08em] text-[#006b5b]">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[0.72rem] text-slate">
                    {conversacion.telefono ?? "Sin teléfono"}
                    {conversacion.asignadoNombre && ` · atiende ${conversacion.asignadoNombre}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {rol === "admin" && !modoDemo && (
                    <select
                      value={conversacion.asignadoA ?? ""}
                      onChange={(e) => e.target.value && asignar(conversacion.id, e.target.value)}
                      className="h-8 max-w-44 rounded-lg bg-white px-2 text-[0.72rem] font-semibold text-[#3b4a54] shadow-[0_1px_3px_rgba(11,20,26,0.12)] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
                      aria-label="Asignar a"
                    >
                      <option value="" disabled>Sin asesor disponible</option>
                      {atendibles.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  )}
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] bg-[radial-gradient(circle_at_center,rgba(11,92,77,0.07)_1px,transparent_1.2px)] bg-[length:18px_18px] px-3 py-4 sm:px-5">
                {cargandoHilo && mensajes.length === 0 ? (
                  <p className="animate-latir py-10 text-center text-[0.8rem] text-slate">
                    Cargando los mensajes…
                  </p>
                ) : (
                  <ol className="mx-auto flex max-w-3xl flex-col gap-1.5" aria-label={`Mensajes con ${conversacion.nombre}`}>
                    {mensajes.map((m, i) => {
                      const anterior = mensajes[i - 1];
                      const nuevoDia = dia(m.en) !== dia(anterior?.en ?? null);
                      return (
                        <li key={m.id} className="contents">
                          {nuevoDia && (
                            <p className="my-3 self-center rounded-lg bg-[#f7ffff]/95 px-3 py-1 text-[0.66rem] font-medium text-[#54656f] shadow-[0_1px_2px_rgba(11,20,26,0.14)]">
                              {dia(m.en)}
                            </p>
                          )}
                          <div
                            className={`max-w-[88%] rounded-lg px-3 py-1.5 text-[0.83rem] leading-relaxed shadow-[0_1px_1px_rgba(11,20,26,0.12)] sm:max-w-[78%] ${
                              m.entrante
                                ? "self-start rounded-tl-sm bg-white text-[#111b21]"
                                : "self-end rounded-tr-sm bg-[#d9fdd3] text-[#111b21]"
                            }`}
                          >
                            {!m.entrante && m.autor && !m.mio && (
                              <p className="mb-0.5 text-[0.68rem] font-bold text-[#008069]">
                                {m.autor}
                              </p>
                            )}

                            {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}

                            {m.adjuntos.map((a) => (
                              <a
                                key={a.url}
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 flex items-center gap-1.5 text-[0.76rem] font-semibold text-coral-700 underline"
                              >
                                <Icono nombre="descargar" className="size-3.5" />
                                Archivo adjunto
                              </a>
                            ))}

                            <p className={`mt-0.5 flex items-center justify-end gap-1 text-[0.62rem] ${m.entrante ? "text-slate-400" : "text-[#667781]"}`}>
                              {reloj(m.en)}
                              {!m.entrante && <span className="font-bold text-[#53bdeb]" aria-label="Entregado">✓✓</span>}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div ref={finDelHilo} />
              </div>

              {aviso && (
                <p role="status" className="shrink-0 border-t border-coral-100 bg-coral-50 px-4 py-2 text-[0.76rem] font-semibold text-coral-700">
                  {aviso}
                </p>
              )}

              <footer className="shrink-0 border-t border-[#d7e4df] bg-[#f0f2f5] p-3">
                {modoDemo ? (
                  <div className="flex items-center justify-center gap-2 px-1 py-2 text-center text-[0.78rem] font-medium text-[#54656f]">
                    <Icono nombre="whatsapp" className="size-4 text-[#00a884]" />
                    Vista de muestra · el envío se activará al conectar el número oficial.
                  </div>
                ) : rol === "admin" ? (
                  <p className="px-1 py-2 text-center text-[0.78rem] text-slate">
                    Vista de supervisión. Los administradores no responden mensajes.
                  </p>
                ) : !conversacion.mia ? (
                  <p className="px-1 py-2 text-center text-[0.78rem] text-slate">
                    Esta conversación no está asignada a tu perfil.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={cajaTexto}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
                      }}
                      rows={1}
                      placeholder="Escribe un mensaje…"
                      aria-label="Mensaje"
                      className="max-h-32 min-h-[2.5rem] flex-1 resize-y rounded-lg bg-white px-3 py-2.5 text-[0.84rem] text-[#111b21] shadow-[0_1px_2px_rgba(11,20,26,0.12)] placeholder:text-[#667781] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
                    />
                    <Boton type="button" onClick={enviar} disabled={enviando || !texto.trim()} tono="oscuro" className="!rounded-full !bg-[#00a884] hover:!bg-[#008069]">
                      <Icono nombre="whatsapp" className="size-4" />
                      {enviando ? "Enviando…" : "Enviar"}
                    </Boton>
                  </div>
                )}
              </footer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
