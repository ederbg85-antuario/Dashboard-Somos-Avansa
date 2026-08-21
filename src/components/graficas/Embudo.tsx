import { numero, porcentaje } from "@/lib/formato";

export type PasoEmbudo = {
  etiqueta: string;
  /** Cuántos expedientes **alcanzaron** esta etapa, no cuántos están parados en ella. */
  total: number;
  color: string;
};

/**
 * Embudo del pipeline.
 *
 * Cada barra muestra tres cosas: cuántos expedientes llegaron a la etapa
 * (ancho y cifra), qué proporción representan del total que entró, y cuántos
 * sobrevivieron del paso anterior. Sin el paso a paso sólo se ve que el
 * embudo se angosta; con él se ve *dónde* se cae la gente, que es lo
 * accionable.
 *
 * Ojo con el dato de entrada: `total` tiene que ser acumulado —«llegó hasta
 * aquí o más lejos»—, no el conteo de la columna del tablero. Con el conteo
 * por columna una etapa puede tener más expedientes que la anterior y el
 * embudo acaba reportando conversiones de 124 %, que no existen.
 */
export function Embudo({ etapas }: { etapas: PasoEmbudo[] }) {
  const entrada = etapas[0]?.total ?? 0;
  const tope = Math.max(...etapas.map((e) => e.total), 1);

  return (
    <ul className="space-y-2">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].total : null;
        const delPaso = anterior && anterior > 0 ? (e.total / anterior) * 100 : null;
        const delTotal = entrada > 0 ? (e.total / entrada) * 100 : null;
        const ancho = Math.max((e.total / tope) * 100, e.total > 0 ? 8 : 1.5);

        return (
          <li key={e.etiqueta} className="grid grid-cols-[6.2rem_1fr_3.1rem_3.6rem] items-center gap-2">
            <span className="truncate text-[0.78rem] font-medium text-ink" title={e.etiqueta}>
              {e.etiqueta}
            </span>

            <span className="h-7 overflow-hidden rounded-lg bg-mist">
              <span
                className="flex h-full items-center rounded-lg px-2.5 transition-[width] duration-500"
                style={{ width: `${ancho}%`, background: e.color }}
              >
                <span className="cifra text-[0.73rem] font-semibold text-white">{numero(e.total)}</span>
              </span>
            </span>

            <span className="cifra text-right text-[0.72rem] text-slate" title="Del total que entró">
              {porcentaje(delTotal, 0)}
            </span>

            <span
              className="cifra text-right text-[0.72rem] font-semibold"
              style={{ color: delPaso === null ? "#9AA5B1" : delPaso >= 60 ? "#1E9E8D" : delPaso >= 35 ? "#C79A6E" : "#E63A58" }}
              title={delPaso === null ? "Punto de entrada" : "Pasó desde la etapa anterior"}
            >
              {delPaso === null ? "entrada" : porcentaje(delPaso, 0)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
