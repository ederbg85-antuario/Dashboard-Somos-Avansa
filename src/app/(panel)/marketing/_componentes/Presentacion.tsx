import type { ReactNode } from "react";
import { Encabezado } from "@/components/panel/Encabezado";
import { Icono, type NombreIcono } from "@/components/ui/Icono";
import { MarcaPlataforma } from "./MarcaPlataforma";
import { NavegacionMarketing } from "./NavegacionMarketing";
import estilos from "../marketing.module.css";

type Plataforma = Parameters<typeof MarcaPlataforma>[0]["plataforma"];

export function CabeceraMarketing({
  titulo,
  apoyo,
  acciones,
}: {
  titulo: string;
  apoyo: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <Encabezado titulo={titulo} apoyo={apoyo} acciones={acciones}>
      <NavegacionMarketing />
    </Encabezado>
  );
}

export function HeroPlataforma({
  plataforma,
  ceja,
  titulo,
  texto,
  cifras,
  tono = "oscuro",
}: {
  plataforma: Plataforma;
  ceja: string;
  titulo: ReactNode;
  texto: ReactNode;
  cifras?: { etiqueta: string; valor: ReactNode }[];
  tono?: "oscuro" | "meta" | "search" | "instagram";
}) {
  return (
    <section className={`${estilos.hero} ${estilos[tono]}`}>
      <div className={estilos.orbe} aria-hidden="true" />
      <div className="relative z-[1] grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)] lg:items-end">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-white shadow-elevada">
              <MarcaPlataforma plataforma={plataforma} className="size-7" />
            </span>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white/65">{ceja}</p>
          </div>
          <h2 className="mt-5 max-w-3xl text-[clamp(1.7rem,3.2vw,3rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
            {titulo}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.84rem] leading-relaxed text-white/70">{texto}</p>
        </div>

        {cifras && cifras.length > 0 ? (
          <dl className="grid grid-cols-2 gap-2.5">
            {cifras.map((cifra, indice) => (
              <div key={cifra.etiqueta} className={`${estilos.cifraHero} ${indice === 0 ? "col-span-2" : ""}`}>
                <dt className="text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-white/55">{cifra.etiqueta}</dt>
                <dd className="cifra mt-1.5 text-[clamp(1.35rem,2.5vw,2.2rem)] font-semibold leading-none tracking-tight text-white">{cifra.valor}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}

export function MetricaPlataforma({
  rotulo,
  valor,
  apoyo,
  icono,
  color = "#FF4D6D",
  destacado = false,
}: {
  rotulo: string;
  valor: ReactNode;
  apoyo: ReactNode;
  icono: NombreIcono;
  color?: string;
  destacado?: boolean;
}) {
  return (
    <article className={`${estilos.metrica} ${destacado ? estilos.metricaDestacada : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-slate">{rotulo}</p>
        <span className="grid size-9 place-items-center rounded-xl" style={{ color, background: `${color}14` }}>
          <Icono nombre={icono} className="size-[1.05rem]" />
        </span>
      </div>
      <p className="cifra mt-4 text-[clamp(1.7rem,2.7vw,2.55rem)] font-semibold leading-none tracking-[-0.04em] text-ink">{valor}</p>
      <p className="mt-2 text-[0.74rem] leading-snug text-slate">{apoyo}</p>
      <span className={estilos.fileteMetrica} style={{ background: color }} aria-hidden="true" />
    </article>
  );
}

export function EstadoFuente({
  plataforma,
  titulo,
  texto,
  estado,
  accion,
}: {
  plataforma: Plataforma;
  titulo: string;
  texto: ReactNode;
  estado: "conectado" | "pendiente" | "error";
  accion?: ReactNode;
}) {
  const etiqueta = estado === "conectado" ? "Conectado" : estado === "error" ? "Revisar" : "Pendiente";
  const color = estado === "conectado" ? "#1E9E8D" : estado === "error" ? "#E63A58" : "#C79A6E";

  return (
    <article className={`${estilos.estadoFuente} flex items-start gap-3.5`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-tarjeta ring-1 ring-hair">
        <MarcaPlataforma plataforma={plataforma} className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[0.84rem] font-semibold text-ink">{titulo}</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.66rem] font-semibold" style={{ color, background: `${color}14` }}>
            <span className={estado === "conectado" ? estilos.puntoVivo : "size-1.5 rounded-full"} style={{ background: color }} />
            {etiqueta}
          </span>
        </div>
        <p className="mt-1 text-[0.74rem] leading-relaxed text-slate">{texto}</p>
        {accion ? <div className="mt-3">{accion}</div> : null}
      </div>
    </article>
  );
}

