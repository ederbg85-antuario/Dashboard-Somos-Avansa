import type { Metadata } from "next";
import { Barras, BarrasHorizontales, type BarraDato } from "@/components/graficas/Barras";
import { Linea, type PuntoSerie } from "@/components/graficas/Linea";
import { SelectorPeriodo } from "@/components/panel/SelectorPeriodo";
import { BotonEnlace } from "@/components/ui/Boton";
import { Icono, type NombreIcono } from "@/components/ui/Icono";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Vacio } from "@/components/ui/Vacio";
import {
  dineroCorto,
  fecha,
  fechaHora,
  iniciales,
  numero,
  porcentaje,
} from "@/lib/formato";
import { resolverPeriodo } from "@/lib/periodo";
import { cargarRendimiento, type FilaRendimiento } from "@/lib/rendimiento";
import { exigirRol } from "@/lib/supabase/sesion";

export const metadata: Metadata = { title: "Rendimiento" };
export const dynamic = "force-dynamic";

export default async function RendimientoAsesores({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const sesion = await exigirRol("admin", "asesor");
  const { periodo } = await searchParams;
  const rango = resolverPeriodo(periodo);
  const resultado = await cargarRendimiento(sesion, rango);

  if (!resultado.listo) {
    return (
      <Tarjeta className="animate-entrar !ring-0 shadow-elevada">
        <Vacio
          icono="alerta"
          titulo="El rendimiento no está disponible"
          texto={`${resultado.detalle} No se muestran ceros porque no se pudo verificar la fuente.`}
        />
      </Tarjeta>
    );
  }

  const { filas, tendencia, sinAsignar, actualizadoEn, chatwoot } = resultado.datos;
  const esAdmin = sesion.perfil.rol === "admin";
  const totalLeads = suma(filas, "leadsAsignados");
  const totalCierres = suma(filas, "cierresPeriodo");
  const totalCierresCohorte = suma(filas, "cierresCohorte");
  const totalCerrado = suma(filas, "montoCerrado");
  const totalEnTramite = suma(filas, "montoEnTramite");
  const totalExpedientes = suma(filas, "expedientesEnTramite");
  const totalChatsRegistrados = filas.reduce((suma, fila) => suma + fila.chatsRegistrados, 0);
  const totalCargaActiva = filas.every((fila) => fila.cargaActiva !== null)
    ? filas.reduce((suma, fila) => suma + (fila.cargaActiva ?? 0), 0)
    : null;
  const conversion = totalLeads > 0 ? (totalCierresCohorte * 100) / totalLeads : null;
  const tiempoCierre = promedioPonderado(filas, "tiempoMedioCierreDias", "cierresPeriodo");
  const primeraRespuesta = promedioPonderado(filas, "primeraRespuestaMinutos", "respuestasMedidas");
  const hayActividadPeriodo = totalLeads > 0 || totalCierres > 0;

  const serieLeads: PuntoSerie[] = tendencia.map((punto) => ({
    etiqueta: fecha(punto.fecha),
    valor: punto.leads,
  }));
  const serieCierres: PuntoSerie[] = tendencia.map((punto) => ({
    etiqueta: fecha(punto.fecha),
    valor: punto.cierres,
  }));

  const comparativo: BarraDato[] = filas.map((fila) => ({
    etiqueta: nombreCorto(fila),
    valores: [
      { nombre: "Leads asignados", valor: fila.leadsAsignados, color: "#FF4D6D" },
      { nombre: "Cierres", valor: fila.cierresPeriodo, color: "#2FB6A3" },
    ],
  }));

  const montos: BarraDato[] = filas.map((fila) => ({
    etiqueta: nombreCorto(fila),
    valores: [
      { nombre: "Cerrado", valor: fila.montoCerrado, color: "#2FB6A3" },
      { nombre: "En trámite", valor: fila.montoEnTramite, color: "#D9AE83" },
    ],
  }));

  const rankingConversion = filas
    .filter((fila) => fila.conversionCohorte !== null)
    .toSorted((a, b) => (b.conversionCohorte ?? 0) - (a.conversionCohorte ?? 0))
    .map((fila) => ({
      etiqueta: nombreCompleto(fila),
      valor: fila.conversionCohorte ?? 0,
      color: "#FF4D6D",
      nota: `${fila.cierresCohorte}/${fila.leadsAsignados}`,
    }));

  const carga = filas
    .filter((fila) => fila.cargaActiva !== null)
    .toSorted((a, b) => (b.cargaActiva ?? 0) - (a.cargaActiva ?? 0))
    .map((fila) => ({
      etiqueta: nombreCompleto(fila),
      valor: fila.cargaActiva ?? 0,
      color: "#2FB6A3",
      nota: "abiertos",
    }));

  return (
    <>
      <section className="relative mb-5 animate-entrar overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-deep via-deep-700 to-[#195063] p-5 text-white shadow-flotante sm:p-6">
        <span className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-coral/20 blur-3xl" aria-hidden="true" />
        <span className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-teal/20 blur-3xl" aria-hidden="true" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-coral-100">
              <span className="grid size-7 place-items-center rounded-lg bg-white/10">
                <Icono nombre="reporte" className="size-3.5" />
              </span>
              Operación comercial
            </p>
            <h1 className="mt-3 text-[1.6rem] font-semibold leading-tight tracking-[-0.035em] sm:text-[1.85rem]">
              {esAdmin ? "Rendimiento de asesores" : "Mi rendimiento"}
            </h1>
            <p className="mt-1.5 max-w-xl text-[0.8rem] leading-relaxed text-white/65">
              {esAdmin
                ? "Compara carga, cierres y valor producido por el equipo con métricas verificables del CRM."
                : "Consulta tus leads, cierres y carga actual. Esta vista no recibe información de otros asesores."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotonEnlace href="/crm" tono="claro" className="!bg-white/10 !text-white !ring-0 backdrop-blur hover:!bg-white/20">
              <Icono nombre="embudo" className="size-4" />
              Ver CRM
            </BotonEnlace>
            <BotonEnlace href="/conversaciones" tono="claro" className="!bg-white/10 !text-white !ring-0 backdrop-blur hover:!bg-white/20">
              <Icono nombre="conversacion" className="size-4" />
              Ir a la bandeja
            </BotonEnlace>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p className="text-[0.72rem] text-white/50">
            Corte {fechaHora(actualizadoEn)} · propietario actual · sin registros demo
          </p>
          <div className="max-w-full overflow-x-auto pb-1">
            <SelectorPeriodo actual={rango.clave} />
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica rotulo="Leads asignados" valor={numero(totalLeads)} icono="usuarios" color="coral"
                 nota={`Ingresaron en ${rango.etiqueta.toLowerCase()}`} />
        <Metrica rotulo="Cierres" valor={numero(totalCierres)} icono="cheque" color="teal"
                 nota="Fecha de cierre en el periodo" />
        <Metrica rotulo="Conversión" valor={porcentaje(conversion)} icono="embudo" color="coral"
                 nota="Cierres de la cohorte ÷ leads de la cohorte" />
        <Metrica rotulo="Tiempo de cierre" valor={duracionDias(tiempoCierre)} icono="reloj" color="sand"
                 nota="Promedio de cierres del periodo" />
        <Metrica rotulo="Monto cerrado" valor={dineroCorto(totalCerrado)} icono="monedas" color="teal"
                 nota="Valor estimado de expedientes ganados" />
        <Metrica rotulo="Monto en trámite" valor={dineroCorto(totalEnTramite)} icono="carpeta" color="sand"
                 nota={`${numero(totalExpedientes)} expedientes abiertos`} />
        <Metrica rotulo="Carga WhatsApp" valor={totalCargaActiva === null ? "—" : numero(totalCargaActiva)} icono="conversacion" color="teal"
                 nota={`${numero(totalChatsRegistrados)} chats registrados localmente`} />
        <Metrica rotulo="Primera respuesta" valor={duracionRespuesta(primeraRespuesta)} icono="whatsapp" color="teal"
                 nota={primeraRespuesta === null ? "Requiere respuestas verificadas" : "Chats firmados del periodo"} />
      </div>

      {(sinAsignar > 0 || chatwoot.estado !== "listo") && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {sinAsignar > 0 && (
            <AvisoFuente
              icono="alerta"
              titulo={`${numero(sinAsignar)} leads sin asesor`}
              texto="No se incluyen en la comparación hasta que tengan un responsable."
              tono="coral"
            />
          )}
          {chatwoot.estado !== "listo" && (
            <AvisoFuente
              icono="whatsapp"
              titulo={chatwoot.estado === "sin-configurar" ? "Métricas de WhatsApp pendientes" : "Cobertura parcial de WhatsApp"}
              texto={chatwoot.detalle}
              tono={chatwoot.estado === "error" ? "coral" : "sand"}
            />
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Tarjeta className="!ring-0 shadow-elevada">
          <CabezaTarjeta
            titulo="Actividad del periodo"
            apoyo="Leads por fecha de entrada y cierres por fecha de cierre. Ambas series empiezan en cero."
          />
          <div className="mt-4">
            {hayActividadPeriodo ? (
              <Linea
                serie={serieLeads}
                color="#FF4D6D"
                alto={255}
                comparativo={{ serie: serieCierres, color: "#2FB6A3", nombre: "Cierres" }}
              />
            ) : (
              <Vacio
                icono="reporte"
                titulo="Aún no hay actividad medible"
                texto={`El gráfico comenzará a dibujarse cuando entren leads o se registren cierres en ${rango.etiqueta.toLowerCase()}.`}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-4 text-[0.7rem] text-slate">
            <Leyenda color="#FF4D6D">Leads asignados</Leyenda>
            <Leyenda color="#2FB6A3">Cierres</Leyenda>
          </div>
        </Tarjeta>

        <Tarjeta className="!ring-0 shadow-elevada">
          <CabezaTarjeta
            titulo={esAdmin ? "Volumen por asesor" : "Mi volumen"}
            apoyo="Entradas del periodo frente a cierres realizados en el mismo intervalo."
          />
          <div className="mt-4">
            {hayActividadPeriodo ? (
              <Barras datos={comparativo} formato="numero" alto={255} />
            ) : (
              <Vacio icono="usuarios" titulo="Sin volumen todavía" texto="No hay leads ni cierres que comparar en este periodo." />
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Tarjeta className="!ring-0 shadow-elevada">
          <CabezaTarjeta
            titulo="Conversión de cohorte"
            apoyo="De los leads que entraron en el periodo, cuántos ya están cerrados como ganados."
          />
          <div className="mt-5">
            {rankingConversion.length > 0 ? (
              <RankingPorcentaje datos={rankingConversion} />
            ) : (
              <Vacio icono="embudo" titulo="Sin base de conversión" texto="La tasa aparecerá cuando exista al menos un lead asignado en el periodo." />
            )}
          </div>
        </Tarjeta>

        <Tarjeta className="!ring-0 shadow-elevada">
          <CabezaTarjeta
            titulo="Valor comercial"
            apoyo="Monto estimado cerrado en el periodo y monto actual del pipeline abierto."
          />
          <div className="mt-4">
            {totalCerrado > 0 || totalEnTramite > 0 ? (
              <Barras datos={montos} formato="dinero" alto={230} />
            ) : (
              <Vacio icono="monedas" titulo="Sin montos capturados" texto="Agrega el valor estimado en los expedientes para comparar producción y pipeline." />
            )}
          </div>
        </Tarjeta>

        <Tarjeta className="!ring-0 shadow-elevada">
          <CabezaTarjeta
            titulo="Carga en WhatsApp"
            apoyo="Chats abiertos o pendientes, consultados directamente desde Chatwoot."
            accion={totalCargaActiva !== null ? (
              <span className="cifra rounded-xl bg-teal-50 px-2.5 py-1 text-[0.74rem] font-semibold text-teal-700">
                {numero(totalCargaActiva)} activos
              </span>
            ) : undefined}
          />
          <div className="mt-5">
            {chatwoot.estado === "listo" || chatwoot.estado === "parcial" ? (
              carga.some((fila) => fila.valor > 0) ? (
                <BarrasHorizontales datos={carga} formato="numero" />
              ) : (
                <Vacio icono="whatsapp" titulo="Bandeja al día" texto="No hay chats abiertos o pendientes asignados en este momento." />
              )
            ) : (
              <Vacio icono="whatsapp" titulo="Fuente no disponible" texto={chatwoot.detalle} />
            )}
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4 !ring-0 shadow-elevada">
        <CabezaTarjeta
          titulo={esAdmin ? "Detalle del equipo" : "Detalle de mi desempeño"}
          apoyo={`Definiciones uniformes para ${rango.etiqueta.toLowerCase()}. Los guiones significan que no existe una base verificable.`}
        />
        {filas.length === 0 ? (
          <Vacio icono="usuarios" titulo="No hay asesores disponibles" texto="Activa al menos un perfil de asesor para comenzar a medir rendimiento." />
        ) : (
          <Tabla className="mt-4">
            <Encabezados>
              <Th>Asesor</Th>
              <Th numerica>Leads</Th>
              <Th numerica>Cierres</Th>
              <Th numerica>Conversión</Th>
              <Th numerica>Cierre medio</Th>
              <Th numerica>Cerrado</Th>
              <Th numerica>En trámite</Th>
              <Th numerica>Carga WA</Th>
              <Th numerica>1ª respuesta</Th>
            </Encabezados>
            <tbody>
              {filas.map((fila) => (
                <Fila key={fila.asesor.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-coral to-coral-700 text-[0.67rem] font-bold text-white shadow-tarjeta">
                        {iniciales(nombreCompleto(fila))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{nombreCompleto(fila)}</p>
                        <p className="text-[0.67rem] text-slate-400">
                          {fila.asesor.activo ? (fila.asesor.recibe_leads ? "Recibe leads" : "Reparto pausado") : "Perfil inactivo"}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td numerica>{numero(fila.leadsAsignados)}</Td>
                  <Td numerica>{numero(fila.cierresPeriodo)}</Td>
                  <Td numerica>{porcentaje(fila.conversionCohorte)}</Td>
                  <Td numerica>{duracionDias(fila.tiempoMedioCierreDias)}</Td>
                  <Td numerica>{dineroCorto(fila.montoCerrado)}</Td>
                  <Td numerica>
                    <span className="block font-semibold text-ink">{dineroCorto(fila.montoEnTramite)}</span>
                    <span className="block text-[0.67rem] text-slate-400">{numero(fila.expedientesEnTramite)} expedientes</span>
                  </Td>
                  <Td numerica>
                    <span className="block">{fila.cargaActiva === null ? "—" : numero(fila.cargaActiva)}</span>
                    <span className="block text-[0.67rem] text-slate-400">{numero(fila.chatsRegistrados)} registrados</span>
                  </Td>
                  <Td numerica>
                    <span className="block">{duracionRespuesta(fila.primeraRespuestaMinutos)}</span>
                    {fila.respuestasMedidas > 0 && (
                      <span className="block text-[0.67rem] text-slate-400">{numero(fila.respuestasMedidas)} chats</span>
                    )}
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <Tarjeta className="mt-4 !ring-0 shadow-tarjeta">
        <div className="grid gap-4 text-[0.74rem] leading-relaxed text-slate lg:grid-cols-3">
          <Definicion titulo="Asignación y privacidad">
            Los resultados se atribuyen al propietario actual. Dirección ve el equipo completo; cada asesor consulta únicamente sus filas autorizadas por RLS.
          </Definicion>
          <Definicion titulo="Conversión y cierre">
            Conversión = cierres ganados de la cohorte ÷ leads que entraron en el periodo. El tiempo de cierre usa la diferencia entre entrada y cierre sellado por el CRM.
          </Definicion>
          <Definicion titulo="WhatsApp">
            La primera respuesta sólo usa mensajes entrantes y respuestas firmadas desde el panel. No se atribuyen mensajes enviados directamente en Chatwoot.
          </Definicion>
        </div>
      </Tarjeta>
    </>
  );
}

function suma(filas: FilaRendimiento[], campo: "leadsAsignados" | "cierresPeriodo" | "cierresCohorte" | "montoCerrado" | "expedientesEnTramite" | "montoEnTramite") {
  return filas.reduce((total, fila) => total + fila[campo], 0);
}

function promedioPonderado(
  filas: FilaRendimiento[],
  valor: "tiempoMedioCierreDias" | "primeraRespuestaMinutos",
  peso: "cierresPeriodo" | "respuestasMedidas",
): number | null {
  const medibles = filas.filter((fila) => fila[valor] !== null && fila[peso] > 0);
  const total = medibles.reduce((suma, fila) => suma + fila[peso], 0);
  if (total === 0) return null;
  return medibles.reduce((suma, fila) => suma + fila[valor]! * fila[peso], 0) / total;
}

function nombreCompleto(fila: FilaRendimiento) {
  return `${fila.asesor.nombre} ${fila.asesor.apellidos}`.trim();
}

function nombreCorto(fila: FilaRendimiento) {
  return fila.asesor.nombre.split(" ")[0] || nombreCompleto(fila);
}

function duracionDias(valor: number | null) {
  if (valor === null) return "—";
  if (valor < 1) return "< 1 día";
  return `${valor.toFixed(valor < 10 ? 1 : 0).replace(/\.0$/, "")} días`;
}

function duracionRespuesta(minutos: number | null) {
  if (minutos === null) return "—";
  if (minutos < 1) return "< 1 min";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  if (minutos < 1_440) return `${(minutos / 60).toFixed(1).replace(/\.0$/, "")} h`;
  return duracionDias(minutos / 1_440);
}

function Metrica({
  rotulo,
  valor,
  icono,
  color,
  nota,
}: {
  rotulo: string;
  valor: string;
  icono: NombreIcono;
  color: "coral" | "teal" | "sand";
  nota: string;
}) {
  const colores = {
    coral: "bg-coral-50 text-coral",
    teal: "bg-teal-50 text-teal-700",
    sand: "bg-sand-50 text-[#A9763F]",
  };

  return (
    <article className="group animate-entrar rounded-2xl bg-white p-4 shadow-elevada transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-flotante">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-slate">{rotulo}</p>
          <p className="cifra mt-2 truncate text-[1.3rem] font-semibold leading-none tracking-tight text-ink">{valor}</p>
        </div>
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${colores[color]}`}>
          <Icono nombre={icono} className="size-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-[0.66rem] leading-snug text-slate-400">{nota}</p>
    </article>
  );
}

function AvisoFuente({
  icono,
  titulo,
  texto,
  tono,
}: {
  icono: NombreIcono;
  titulo: string;
  texto: string;
  tono: "coral" | "sand";
}) {
  const estilos = tono === "coral"
    ? "bg-coral-50 text-coral-700"
    : "bg-sand-50 text-[#8C6238]";
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 shadow-tarjeta ${estilos}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white/70 shadow-tarjeta">
        <Icono nombre={icono} className="size-4" />
      </span>
      <div>
        <p className="text-[0.78rem] font-semibold">{titulo}</p>
        <p className="mt-0.5 text-[0.7rem] leading-relaxed opacity-75">{texto}</p>
      </div>
    </div>
  );
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  );
}

function RankingPorcentaje({
  datos,
}: {
  datos: { etiqueta: string; valor: number; color: string; nota: string }[];
}) {
  return (
    <ul className="space-y-3.5">
      {datos.map((dato) => (
        <li key={dato.etiqueta}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8rem] font-medium text-ink" title={dato.etiqueta}>
              {dato.etiqueta}
            </span>
            <span className="cifra shrink-0 text-[0.8rem] font-semibold text-ink">
              {porcentaje(dato.valor)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(Math.max(dato.valor, 0), 100)}%`, background: dato.color }}
              />
            </div>
            <span className="cifra w-12 shrink-0 text-right text-[0.68rem] text-slate-400">{dato.nota}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Definicion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-ink">{titulo}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}
