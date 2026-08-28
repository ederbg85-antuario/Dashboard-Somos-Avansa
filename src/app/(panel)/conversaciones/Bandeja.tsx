"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icono } from "@/components/ui/Icono";
import { Boton } from "@/components/ui/Boton";
import { Vacio } from "@/components/ui/Vacio";
import { ETAPA, ETAPAS } from "@/lib/constantes";
import { ZONA } from "@/lib/formato";
import type { LeadEstado, RolUsuario } from "@/lib/supabase/tipos";

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
  sinAtender: boolean;
  sinLeer: number;
  asignadoA: string | null;
  asignadoNombre: string | null;
  mia: boolean;
  libre: boolean;
  etapa: LeadEstado | null;
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
type FiltroRapido = "todos" | "nuevos" | "no-leidos" | "por-atender" | "sin-asignar";
type FiltroEtapa = "todas" | "sin-etapa" | LeadEstado;

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

function terminoBusqueda(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
}

export function Bandeja({
  inicial, ocultas: ocultasIniciales, rol, equipo, modoDemo = false,
  mensajesDemo = SIN_MENSAJES, etapasDisponibles: etapasIniciales = true,
}: {
  inicial: Fila[];
  ocultas: number;
  rol: RolUsuario;
  equipo: Companero[];
  modoDemo?: boolean;
  mensajesDemo?: Mensaje[];
  etapasDisponibles?: boolean;
}) {
  const [filas, setFilas] = useState<Fila[]>(inicial);
  const [ocultas, setOcultas] = useState(ocultasIniciales);
  const [abierta, setAbierta] = useState<number | null>(modoDemo ? inicial[0]?.id ?? null : null);
  const [mensajes, setMensajes] = useState<Mensaje[]>(modoDemo ? mensajesDemo : SIN_MENSAJES);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>("todos");
  const [filtroEtapa, setFiltroEtapa] = useState<FiltroEtapa>("todas");
  const [busca, setBusca] = useState("");
  const [etapasDisponibles, setEtapasDisponibles] = useState(etapasIniciales);
  const [listaDesactualizada, setListaDesactualizada] = useState(false);

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
        setListaDesactualizada(true);
        setAviso("Tu sesión expiró. Vuelve a entrar para seguir atendiendo.");
        return;
      }
      if (!r.ok) {
        setListaDesactualizada(true);
        return;
      }
      const d = await r.json();
      setFilas(d.filas as Fila[]);
      setOcultas(d.ocultas as number);
      setListaDesactualizada(false);
      const disponibles = d.etapasDisponibles !== false;
      setEtapasDisponibles(disponibles);
      if (!disponibles) setFiltroEtapa("todas");
    } catch {
      setListaDesactualizada(true);
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
    const q = terminoBusqueda(busca.trim());
    return filas.filter((f) => {
      if (filtroRapido === "nuevos" && !f.sinAtender) return false;
      if (filtroRapido === "no-leidos" && f.sinLeer <= 0) return false;
      if (filtroRapido === "por-atender" && !f.entranteSinResponder) return false;
      if (filtroRapido === "sin-asignar" && !f.libre) return false;
      if (filtroEtapa === "sin-etapa" && f.etapa !== null) return false;
      if (filtroEtapa !== "todas" && filtroEtapa !== "sin-etapa" && f.etapa !== filtroEtapa) return false;
      if (!q) return true;
      const texto = terminoBusqueda([
        f.nombre,
        f.telefono ?? "",
        f.avance,
        f.asignadoNombre ?? "",
        f.etapa ? ETAPA[f.etapa].nombre : "",
      ].join(" "));
      return texto.includes(q);
    });
  }, [busca, filas, filtroEtapa, filtroRapido]);

  const cuenta = useMemo(() => ({
    todos: filas.length,
    nuevos: filas.filter((f) => f.sinAtender).length,
    "no-leidos": filas.filter((f) => f.sinLeer > 0).length,
    "por-atender": filas.filter((f) => f.entranteSinResponder).length,
    "sin-asignar": filas.filter((f) => f.libre).length,
  }), [filas]);

  const cuentaEtapas = useMemo(() => {
    const valores = new Map<FiltroEtapa, number>([["sin-etapa", 0]]);
    for (const etapa of ETAPAS) valores.set(etapa.clave, 0);
    for (const fila of filas) {
      const clave = fila.etapa ?? "sin-etapa";
      valores.set(clave, (valores.get(clave) ?? 0) + 1);
    }
    return valores;
  }, [filas]);

  const filtrosRapidos: { clave: FiltroRapido; etiqueta: string; n: number }[] = [
    { clave: "todos", etiqueta: "Todos", n: cuenta.todos },
    { clave: "nuevos", etiqueta: "Nuevos", n: cuenta.nuevos },
    { clave: "no-leidos", etiqueta: "No leídos", n: cuenta["no-leidos"] },
    { clave: "por-atender", etiqueta: "Por atender", n: cuenta["por-atender"] },
    ...(rol === "admin"
      ? [{ clave: "sin-asignar" as const, etiqueta: "Sin asignar", n: cuenta["sin-asignar"] }]
      : []),
  ];
  const hayFiltro = Boolean(busca.trim()) || filtroRapido !== "todos" || filtroEtapa !== "todas";

  function elegirFiltroRapido(clave: FiltroRapido) {
    setFiltroRapido(clave);
    setFiltroEtapa("todas");
  }

  function elegirEtapa(clave: FiltroEtapa) {
    setFiltroEtapa(clave);
    setFiltroRapido("todos");
  }

  function limpiarFiltros() {
    setBusca("");
    setFiltroRapido("todos");
    setFiltroEtapa("todas");
  }

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
          <div className="shrink-0 bg-white p-3 shadow-[0_10px_28px_-25px_rgba(15,45,61,0.5)]">
            <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
              <p className="flex items-center gap-2 text-[0.9rem] font-semibold tracking-tight text-deep">
                <span className="grid size-7 place-items-center rounded-lg bg-coral-50 text-coral">
                  <Icono nombre="bandeja" className="size-3.5" />
                </span>
                Chats
                <span className="cifra text-[0.7rem] font-medium text-slate-400">{cuenta.todos}</span>
                {listaDesactualizada && (
                  <span
                    className="size-2 rounded-full bg-sand shadow-[0_0_0_3px_rgb(217_174_131/.14)]"
                    role="status"
                    aria-label="La lista no pudo actualizarse"
                    title="Sin actualizar"
                  />
                )}
              </p>
              {hayFiltro && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="rounded-lg bg-mist px-2 py-1 text-[0.65rem] font-semibold text-slate transition hover:bg-coral-50 hover:text-coral-700"
                >
                  Limpiar
                </button>
              )}
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
                placeholder="Buscar chats"
                className="h-9 w-full rounded-xl bg-mist/80 pl-9 pr-3 text-[0.78rem] text-ink shadow-inner placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-coral/30"
              />
            </label>

            <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Filtros rápidos">
              {filtrosRapidos.map((filtro) => (
                <button
                  key={filtro.clave}
                  type="button"
                  onClick={() => elegirFiltroRapido(filtro.clave)}
                  aria-pressed={filtroRapido === filtro.clave}
                  className={`inline-flex min-w-0 items-center justify-center rounded-lg px-2.5 py-1.5 text-[0.67rem] font-semibold transition-all duration-200 ${
                    filtroRapido === filtro.clave
                      ? "bg-deep text-white shadow-tarjeta"
                      : "bg-mist/70 text-slate hover:bg-white hover:text-ink hover:shadow-tarjeta"
                  }`}
                >
                  {filtro.etiqueta}
                  <span className={filtroRapido === filtro.clave ? "ml-1 opacity-65" : "ml-1 text-slate-400"}>
                    {filtro.n}
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-1.5 flex items-center gap-2 rounded-xl bg-mist/60 px-2.5 py-1.5">
              <Icono nombre="embudo" className="size-3.5 shrink-0 text-coral" />
              <span className="sr-only">Filtrar por etapa del pipeline</span>
              <select
                value={filtroEtapa}
                onChange={(e) => elegirEtapa(e.target.value as FiltroEtapa)}
                disabled={!etapasDisponibles}
                className="h-7 min-w-0 flex-1 bg-transparent text-[0.7rem] font-semibold text-deep outline-none disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <option value="todas">
                  {etapasDisponibles ? "Todas las etapas" : "Etapas no disponibles"}
                </option>
                {etapasDisponibles && ETAPAS.map((etapa) => (
                  <option key={etapa.clave} value={etapa.clave}>
                    {etapa.nombre} ({cuentaEtapas.get(etapa.clave) ?? 0})
                  </option>
                ))}
                {etapasDisponibles && (cuentaEtapas.get("sin-etapa") ?? 0) > 0 && (
                  <option value="sin-etapa">Sin etapa ({cuentaEtapas.get("sin-etapa")})</option>
                )}
              </select>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {visibles.length === 0 ? (
              <Vacio
                icono={hayFiltro ? "buscar" : "conversacion"}
                titulo={hayFiltro ? "Sin resultados" : "Sin chats activos"}
                texto={hayFiltro ? "Cambia el filtro o limpia la búsqueda." : "Los mensajes nuevos aparecerán aquí."}
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
                      className={`group flex w-full items-start gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-all duration-200 ${
                        f.id === abierta
                          ? "bg-white shadow-elevada"
                          : "hover:bg-white hover:shadow-tarjeta"
                      }`}
                    >
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
                          {f.etapa && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold"
                              style={{
                                color: ETAPA[f.etapa].color,
                                backgroundColor: `${ETAPA[f.etapa].color}16`,
                              }}
                            >
                              {ETAPA[f.etapa].nombre}
                            </span>
                          )}
                          {f.libre ? (
                            <span className="rounded-full bg-sand-50 px-2 py-0.5 text-[0.64rem] font-semibold text-[#B9884F]">
                              Sin asignar
                            </span>
                          ) : f.mia ? (
                            <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[0.64rem] font-semibold text-coral-700">
                              Tú
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
            <p className="shrink-0 bg-white px-4 py-2 text-[0.66rem] text-slate-400 shadow-[0_-8px_20px_-22px_rgba(15,45,61,0.5)]">
              {ocultas === 1 ? "1 chat fuera de esta vista" : `${ocultas} chats fuera de esta vista`}
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
                  Selecciona un chat para abrirlo.
                </p>
              </div>
            </div>
          ) : (
            <div className="chat-whatsapp flex h-full min-h-0 flex-col overflow-hidden rounded-[1.35rem] shadow-elevada">
              <header className="wa-panel z-10 flex shrink-0 items-center gap-3 px-4 py-3 shadow-[0_3px_10px_-8px_rgba(11,20,26,0.55)]">
                <button
                  type="button"
                  onClick={() => abrir(null)}
                  className="wa-muted -ml-1 grid size-8 shrink-0 place-items-center rounded-lg transition hover:bg-black/5 lg:hidden"
                  aria-label="Volver a la lista"
                >
                  <Icono nombre="volver" className="size-4" />
                </button>

                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#008069] text-[0.7rem] font-bold text-white shadow-[0_2px_6px_rgba(0,128,105,0.22)]">
                  {iniciales(conversacion.nombre)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="wa-text truncate text-[0.88rem] font-semibold">
                      {conversacion.nombre}
                    </p>
                    {modoDemo && (
                      <span className="shrink-0 rounded-full bg-[#d9fdd3] px-2 py-0.5 text-[0.61rem] font-bold uppercase tracking-[0.08em] text-[#006b5b]">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="wa-muted truncate text-[0.72rem]">
                    {conversacion.telefono ?? "Sin teléfono"}
                    {conversacion.asignadoNombre && ` · atiende ${conversacion.asignadoNombre}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {rol === "admin" && !modoDemo && (
                    <select
                      value={conversacion.asignadoA ?? ""}
                      onChange={(e) => e.target.value && asignar(conversacion.id, e.target.value)}
                      className="wa-input h-8 max-w-44 rounded-lg px-2 text-[0.72rem] font-semibold shadow-[0_1px_3px_rgba(11,20,26,0.12)] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
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

              <div className="wa-canvas min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
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
                            <p className="wa-date my-3 self-center rounded-lg px-3 py-1 text-[0.66rem] font-medium shadow-[0_1px_2px_rgba(11,20,26,0.14)]">
                              {dia(m.en)}
                            </p>
                          )}
                          <div
                            className={`max-w-[88%] rounded-lg px-3 py-1.5 text-[0.83rem] leading-relaxed shadow-[0_1px_1px_rgba(11,20,26,0.12)] sm:max-w-[78%] ${
                              m.entrante
                                ? "wa-entrante self-start rounded-tl-sm"
                                : "wa-saliente self-end rounded-tr-sm"
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

                            <p className="wa-hora mt-0.5 flex items-center justify-end gap-1 text-[0.62rem]">
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
                <p role="status" className="shrink-0 bg-coral-50 px-4 py-2 text-[0.76rem] font-semibold text-coral-700 shadow-inner">
                  {aviso}
                </p>
              )}

              <footer className="wa-panel z-10 shrink-0 p-3 shadow-[0_-3px_10px_-8px_rgba(11,20,26,0.55)]">
                {modoDemo ? (
                  <div className="wa-muted flex items-center justify-center gap-2 px-1 py-2 text-center text-[0.78rem] font-medium">
                    <Icono nombre="whatsapp" className="size-4 text-[#00a884]" />
                    Vista de muestra
                  </div>
                ) : rol === "admin" ? (
                  <p className="wa-muted px-1 py-2 text-center text-[0.78rem]">
                    Supervisión · responden los asesores
                  </p>
                ) : !conversacion.mia ? (
                  <p className="wa-muted px-1 py-2 text-center text-[0.78rem]">
                    Chat no asignado a tu perfil
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
                      className="wa-input max-h-32 min-h-[2.5rem] flex-1 resize-y rounded-lg px-3 py-2.5 text-[0.84rem] shadow-[0_1px_2px_rgba(11,20,26,0.12)] focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
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
