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

const reloj = (iso: string | null) => (iso ? relojFmt.format(new Date(iso)) : "");
const dia = (iso: string | null) => (iso ? diaFmt.format(new Date(iso)) : "");

/** «14:32» si es de hoy, «mar 19» si no: lo que importa en una lista larga. */
function cuando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia =
    d.toDateString() === hoy.toDateString();
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
  const atendibles = equipo.filter((p) => p.rol === "asesor");

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
          setAviso("Esa conversación ya no está en tu bandeja.");
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

  const cuenta = {
    mias: filas.filter((f) => f.mia).length,
    todas: filas.length,
  };

  const PESTANAS = rol === "admin"
    ? [{ clave: "todas" as const, etiqueta: "Todas", n: cuenta.todas }]
    : [{ clave: "mias" as const, etiqueta: "Asignadas a mí", n: cuenta.mias }];

  return (
    <div className="h-[calc(100dvh-15rem)] min-h-[32rem] overflow-hidden rounded-2xl bg-white ring-1 ring-[#d7e4df] shadow-elevada">
      <div className="grid h-full lg:grid-cols-[21rem_1fr]">

        {/* ---------- columna izquierda: la lista ---------- */}
        <aside
          className={`flex h-full min-h-0 flex-col border-hair lg:border-r ${
            abierta !== null ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="shrink-0 border-b border-[#d7e4df] bg-[#f0f2f5] p-3">
            <label className="relative block">
              <Icono
                nombre="buscar"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nombre, teléfono o texto"
                className="h-9 w-full rounded-xl bg-mist pl-9 pr-3 text-[0.82rem] text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-coral/40"
              />
            </label>

            <div className="mt-2.5 flex gap-1">
              {PESTANAS.map((p) => (
                <button
                  key={p.clave}
                  onClick={() => setFiltro(p.clave)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[0.74rem] font-semibold transition ${
                    filtro === p.clave
                      ? "bg-deep text-white"
                      : "text-slate hover:bg-mist hover:text-ink"
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

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibles.length === 0 ? (
              <Vacio
                icono="conversacion"
                titulo={
                  filtro === "mias" ? "No tienes conversaciones asignadas" : "Todavía no llega nada"
                }
                texto={
                  filtro === "mias"
                    ? "El reparto automático colocará aquí únicamente las conversaciones que te correspondan."
                    : "En cuanto alguien escriba al WhatsApp de avansa, la conversación entra y se reparte sola."
                }
              />
            ) : (
              <ul>
                {visibles.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => abrir(f.id)}
                      className={`flex w-full items-start gap-3 border-b border-hair px-3 py-3 text-left transition ${
                        f.id === abierta ? "bg-[#e7f7ef]" : "hover:bg-[#f5faf7]"
                      }`}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#008069] text-[0.7rem] font-bold text-white">
                        {iniciales(f.nombre)}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[0.84rem] font-semibold text-ink">
                            {f.nombre}
                          </span>
                          <span className="shrink-0 text-[0.68rem] text-slate-400">
                            {cuando(f.ultimoEn)}
                          </span>
                        </span>

                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-[0.78rem] leading-snug text-slate">
                            {f.avance}
                          </span>
                          {f.entranteSinResponder && (
                            <span
                              className="ml-auto size-2 shrink-0 rounded-full bg-[#25d366]"
                              title="Esperando respuesta"
                            />
                          )}
                        </span>

                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          {f.libre ? (
                            <span className="rounded-full bg-sand-50 px-2 py-0.5 text-[0.64rem] font-semibold text-[#B9884F]">
                              Sin asesor disponible
                            </span>
                          ) : f.mia ? (
                            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[0.64rem] font-semibold text-teal-700">
                              Tuya
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
            <p className="shrink-0 border-t border-hair px-3 py-2 text-[0.7rem] leading-snug text-slate-400">
              {ocultas === 1
                ? "Hay 1 conversación más, atendida por otra persona."
                : `Hay ${ocultas} conversaciones más, atendidas por otras personas.`}
            </p>
          )}
        </aside>

        {/* ---------- columna derecha: la conversación ---------- */}
        <section className={`flex h-full min-h-0 flex-col ${abierta === null ? "hidden lg:flex" : "flex"}`}>
          {conversacion === null ? (
            <div className="grid h-full place-items-center">
              <Vacio
                icono="conversacion"
                titulo="Elige una conversación"
                texto="Se abre aquí y puedes responder sin salir del sistema."
              />
            </div>
          ) : (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b border-[#d7e4df] bg-[#f0f2f5] px-4 py-3">
                <button
                  onClick={() => abrir(null)}
                  className="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate hover:bg-mist lg:hidden"
                  aria-label="Volver a la lista"
                >
                  <Icono nombre="volver" className="size-4" />
                </button>

                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#008069] text-[0.7rem] font-bold text-white">
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
                      className="h-8 rounded-xl bg-mist px-2 text-[0.76rem] font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-coral/40"
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

              <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] bg-[radial-gradient(circle_at_center,rgba(11,92,77,0.055)_1px,transparent_1.2px)] bg-[length:18px_18px] px-4 py-4">
                {cargandoHilo && mensajes.length === 0 ? (
                  <p className="animate-latir py-10 text-center text-[0.8rem] text-slate">
                    Cargando la conversación…
                  </p>
                ) : (
                  <ol className="mx-auto flex max-w-2xl flex-col gap-1.5">
                    {mensajes.map((m, i) => {
                      const anterior = mensajes[i - 1];
                      const nuevoDia = dia(m.en) !== dia(anterior?.en ?? null);
                      return (
                        <li key={m.id} className="contents">
                          {nuevoDia && (
                            <p className="my-3 self-center rounded-full bg-white px-3 py-1 text-[0.68rem] font-semibold text-slate ring-1 ring-hair">
                              {dia(m.en)}
                            </p>
                          )}
                          <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[0.84rem] leading-relaxed ${
                              m.entrante
                                ? "self-start rounded-bl-md bg-white text-ink ring-1 ring-hair"
                                : "self-end rounded-br-md bg-[#d9fdd3] text-ink shadow-[0_1px_1px_rgba(11,20,26,0.08)]"
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
                <p className="shrink-0 border-t border-coral-100 bg-coral-50 px-4 py-2 text-[0.76rem] font-semibold text-coral-700">
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
                      className="max-h-32 min-h-[2.5rem] flex-1 resize-y rounded-xl bg-mist px-3 py-2.5 text-[0.84rem] text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-coral/40"
                    />
                    <Boton onClick={enviar} disabled={enviando || !texto.trim()} tono="coral">
                      <Icono nombre="whatsapp" className="size-4" />
                      {enviando ? "Enviando…" : "Enviar"}
                    </Boton>
                  </div>
                )}
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
