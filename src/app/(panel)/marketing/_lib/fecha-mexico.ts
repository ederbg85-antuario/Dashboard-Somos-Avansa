const ZONA_AVANSA = "America/Mexico_City";
const FORMATO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const formateador = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_AVANSA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type FechaConvertida =
  | { ok: true; iso: string; instante: number }
  | { ok: false; error: string };

type PartesFecha = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

function partesEnMexico(instante: number): PartesFecha {
  const partes = Object.fromEntries(
    formateador
      .formatToParts(instante)
      .filter((parte) => parte.type !== "literal")
      .map((parte) => [parte.type, Number(parte.value)]),
  );
  return {
    ano: partes.year,
    mes: partes.month,
    dia: partes.day,
    hora: partes.hour,
    minuto: partes.minute,
    segundo: partes.second,
  };
}

const coincide = (a: PartesFecha, b: PartesFecha) =>
  a.ano === b.ano
  && a.mes === b.mes
  && a.dia === b.dia
  && a.hora === b.hora
  && a.minuto === b.minuto
  && a.segundo === b.segundo;

/**
 * Convierte el valor de un `datetime-local` interpretándolo en la zona donde
 * opera Avansa. Se buscan coincidencias reales en vez de sumar seis horas:
 * así las reglas históricas de la zona también quedan respetadas y una hora
 * inexistente o repetida no se programa de forma silenciosa.
 */
export function fechaLocalMexicoAIso(valor: string): FechaConvertida {
  const coincidencia = FORMATO_LOCAL.exec(valor);
  if (!coincidencia) return { ok: false, error: "Usa una fecha y hora válidas." };

  const objetivo: PartesFecha = {
    ano: Number(coincidencia[1]),
    mes: Number(coincidencia[2]),
    dia: Number(coincidencia[3]),
    hora: Number(coincidencia[4]),
    minuto: Number(coincidencia[5]),
    segundo: Number(coincidencia[6] ?? 0),
  };
  const referencia = Date.UTC(
    objetivo.ano,
    objetivo.mes - 1,
    objetivo.dia,
    objetivo.hora,
    objetivo.minuto,
    objetivo.segundo,
  );
  const fechaReferencia = new Date(referencia);
  const componentesValidos = objetivo.ano >= 2000
    && objetivo.ano <= 2100
    && fechaReferencia.getUTCFullYear() === objetivo.ano
    && fechaReferencia.getUTCMonth() === objetivo.mes - 1
    && fechaReferencia.getUTCDate() === objetivo.dia
    && fechaReferencia.getUTCHours() === objetivo.hora
    && fechaReferencia.getUTCMinutes() === objetivo.minuto
    && fechaReferencia.getUTCSeconds() === objetivo.segundo;
  if (!componentesValidos) return { ok: false, error: "Usa una fecha y hora válidas." };

  const instantes: number[] = [];
  const minutoMs = 60_000;
  for (let desplazamiento = -14 * 60; desplazamiento <= 14 * 60; desplazamiento += 15) {
    const candidato = referencia + desplazamiento * minutoMs;
    if (coincide(partesEnMexico(candidato), objetivo)) instantes.push(candidato);
  }

  if (instantes.length === 0) {
    return { ok: false, error: "La hora elegida no existe en Ciudad de México." };
  }
  if (instantes.length > 1) {
    return { ok: false, error: "La hora elegida es ambigua en Ciudad de México; elige otra." };
  }

  return { ok: true, instante: instantes[0], iso: new Date(instantes[0]).toISOString() };
}
