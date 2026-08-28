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

  const { filas, tendencia, sinAsignar, actualizadoEn, chatwoot, reporteChatwoot } = resultado.datos;
  const esAdmin = sesion.perfil.rol === "admin";
  const totalLeads = suma(filas, "leadsAsignados");
  const totalCierres = suma(filas, "cierresPeriodo");
  const totalCierresCohorte = suma(filas, "cierresCohorte");
  const totalCerrado = suma(filas, "montoCerrado");
  const totalEnTramite = suma(filas, "montoEnTramite");
  const totalCargaActiva = filas.every((fila) => fila.cargaActiva !== null)
    ? filas.reduce((suma, fila) => suma + (fila.cargaActiva ?? 0), 0)
    : null;
  const conversion = totalLeads > 0 ? (totalCierresCohorte * 100) / totalLeads : null;
  const tiempoCierre = promedioPonderado(filas, "tiempoMedioCierreDias", "cierresPeriodo");
  const primeraRespuesta = promedioPonderado(filas, "primeraRespuestaMinutos", "respuestasMedidas");
  const respuestaMedia = promedioPonderado(filas, "respuestaMediaMinutos", "respuestasChatwootMedidas");
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

  const serieConversacionesChatwoot: PuntoSerie[] = (reporteChatwoot?.tendencia ?? []).map((punto) => ({
    etiqueta: fecha(timestampChatwoot(punto.timestamp)),
    valor: punto.conversaciones,
  }));
  const serieResolucionesChatwoot: PuntoSerie[] = (reporteChatwoot?.tendencia ?? []).map((punto) => ({
    etiqueta: fecha(timestampChatwoot(punto.timestamp)),
    valor: punto.resoluciones,
  }));
  const hayActividadChatwoot = (reporteChatwoot?.resumen?.conversaciones ?? 0) > 0
    || (reporteChatwoot?.resumen?.resoluciones ?? 0) > 0;

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
                ? "Compara carga, cierres y valor producido con fuentes verificables del CRM y la bandeja oficial."
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
        <Metrica rotulo="Cierres" valor={numero(totalCierres)} icono="cheque" color="teal"
                 nota="Fecha de cierre en el periodo" />
        <Metrica rotulo="Conversión" valor={porcentaje(conversion)} icono="embudo" color="coral"
                 nota={`${numero(totalCierresCohorte)} de ${numero(totalLeads)} leads`} />
        <Metrica rotulo="Tiempo de cierre" valor={duracionDias(tiempoCierre)} icono="reloj" color="sand"
                 nota="Promedio de cierres del periodo" />
        <Metrica rotulo="Monto cerrado" valor={dineroCorto(totalCerrado)} icono="monedas" color="teal"
                 nota="Valor estimado de expedientes ganados" />
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

      {esAdmin && reporteChatwoot && (
        <details className="group mt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-[0.82rem] font-semibold text-ink shadow-elevada transition hover:shadow-flotante">
            <span className="flex items-center gap-2">
              <Icono nombre="whatsapp" className="size-4 text-teal-700" />
              Informe detallado de WhatsApp
            </span>
            <span className="text-[0.7rem] font-medium text-slate group-open:hidden">Abrir</span>
            <span className="hidden text-[0.7rem] font-medium text-slate group-open:inline">Cerrar</span>
          </summary>
          <section className="mt-3 space-y-4" aria-labelledby="operacion-whatsapp">
          <Tarjeta className="!ring-0 shadow-elevada">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-teal-700">
                  <span className="grid size-7 place-items-center rounded-lg bg-teal-50">
                    <Icono nombre="whatsapp" className="size-3.5" />
                  </span>
                  Fuente oficial de mensajería
                </p>
                <h2 id="operacion-whatsapp" className="mt-2 text-[1.05rem] font-semibold tracking-tight text-ink">
                  Operación de la bandeja de WhatsApp
                </h2>
                <p className="mt-1 max-w-3xl text-[0.72rem] leading-relaxed text-slate">
                  El resumen y la tendencia corresponden sólo a la bandeja configurada. No sustituyen el ranking CRM por asesor.
                </p>
              </div>
              <span className={`rounded-xl px-2.5 py-1 text-[0.68rem] font-semibold ${
                reporteChatwoot.estado === "listo"
                  ? "bg-teal-50 text-teal-700"
                  : reporteChatwoot.estado === "parcial"
                    ? "bg-sand-50 text-[#8C6238]"
                    : "bg-coral-50 text-coral-700"
              }`}>
                {reporteChatwoot.estado === "listo" ? "Informe completo" : reporteChatwoot.estado === "parcial" ? "Cobertura parcial" : "No disponible"}
              </span>
            </div>

            {reporteChatwoot.resumen ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <MetricaCompacta rotulo="Conversaciones" valor={numero(reporteChatwoot.resumen.conversaciones)} />
                <MetricaCompacta rotulo="Resueltas" valor={numero(reporteChatwoot.resumen.resoluciones)} />
                <MetricaCompacta rotulo="Entrantes" valor={numero(reporteChatwoot.resumen.mensajesEntrantes)} />
                <MetricaCompacta rotulo="Salientes" valor={numero(reporteChatwoot.resumen.mensajesSalientes)} />
                <MetricaCompacta rotulo="1ª respuesta" valor={duracionSegundos(reporteChatwoot.resumen.primeraRespuestaSegundos)} />
                <MetricaCompacta rotulo="Resolución" valor={duracionSegundos(reporteChatwoot.resumen.resolucionSegundos)} />
              </div>
            ) : (
              <div className="mt-4">
                <Vacio icono="whatsapp" titulo="Resumen oficial no disponible" texto={reporteChatwoot.detalle} />
              </div>
            )}

            {reporteChatwoot.estado !== "listo" && (
              <p className="mt-3 rounded-xl bg-sand-50 px-3 py-2 text-[0.68rem] leading-relaxed text-[#8C6238]">
                {reporteChatwoot.detalle}
              </p>
            )}
          </Tarjeta>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Tarjeta className="!ring-0 shadow-elevada">
              <CabezaTarjeta
                titulo="Flujo oficial de conversaciones"
                apoyo="Conversaciones creadas y resoluciones registradas en la bandeja configurada."
              />
              <div className="mt-4">
                {hayActividadChatwoot && serieConversacionesChatwoot.length > 0 ? (
                  <Linea
                    serie={serieConversacionesChatwoot}
                    color="#25D366"
                    alto={245}
                    comparativo={{ serie: serieResolucionesChatwoot, color: "#195063", nombre: "Resoluciones" }}
                  />
                ) : (
                  <Vacio icono="conversacion" titulo="Sin actividad oficial en el periodo" texto="La bandeja aún no registra conversaciones ni resoluciones para este intervalo." />
                )}
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-4 text-[0.7rem] text-slate">
                <Leyenda color="#25D366">Conversaciones</Leyenda>
                <Leyenda color="#195063">Resoluciones</Leyenda>
              </div>
            </Tarjeta>

            <Tarjeta className="!ring-0 shadow-elevada">
              <CabezaTarjeta
                titulo="Calidad de respuesta atribuible"
                apoyo="Sólo eventos oficiales que coinciden con mensajes firmados desde el dashboard."
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <IndicadorRespuesta
                  rotulo="Primera respuesta"
                  valor={duracionRespuesta(primeraRespuesta)}
                  muestra={filas.reduce((total, fila) => total + fila.respuestasMedidas, 0)}
                />
                <IndicadorRespuesta
                  rotulo="Tiempo entre respuestas"
                  valor={duracionRespuesta(respuestaMedia)}
                  muestra={filas.reduce((total, fila) => total + fila.respuestasChatwootMedidas, 0)}
                />
              </div>
              <p className="mt-3 text-[0.67rem] leading-relaxed text-slate-400">
                Si una respuesta se envía fuera de Avansa, no se asigna a ningún asesor del CRM.
              </p>
            </Tarjeta>
          </div>

          <Tarjeta className="!ring-0 shadow-elevada">
            <CabezaTarjeta
              titulo="Actividad por usuario del canal"
              apoyo="Resumen operativo de toda la cuenta. Estos usuarios no equivalen necesariamente a los asesores de Avansa."
            />
            {reporteChatwoot.identidades.length > 0 ? (
              <Tabla className="mt-4">
                <Encabezados>
                  <Th>Usuario del canal</Th>
                  <Th numerica>Conversaciones</Th>
                  <Th numerica>Resueltas</Th>
                  <Th numerica>1ª respuesta</Th>
                  <Th numerica>Respuesta media</Th>
                  <Th numerica>Resolución</Th>
                </Encabezados>
                <tbody>
                  {reporteChatwoot.identidades.map((identidad) => (
                    <Fila key={identidad.id}>
                      <Td>
                        <p className="font-semibold text-ink">{identidad.nombre}</p>
                        <p className="text-[0.67rem] text-slate-400">{identidad.email ?? "Usuario sin correo visible"}</p>
                      </Td>
                      <Td numerica>{numero(identidad.conversaciones)}</Td>
                      <Td numerica>{numero(identidad.resoluciones)}</Td>
                      <Td numerica>{duracionSegundos(identidad.primeraRespuestaSegundos)}</Td>
                      <Td numerica>{duracionSegundos(identidad.respuestaSegundos)}</Td>
                      <Td numerica>{duracionSegundos(identidad.resolucionSegundos)}</Td>
                    </Fila>
                  ))}
                </tbody>
              </Tabla>
            ) : (
              <div className="mt-4">
                <Vacio icono="usuarios" titulo="Sin usuarios reportables" texto="La bandeja no devolvió actividad agrupada por usuario en este periodo." />
              </div>
            )}
          </Tarjeta>
          </section>
        </details>
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
            apoyo="Chats abiertos o pendientes, consultados directamente desde la bandeja oficial."
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

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-[0.82rem] font-semibold text-ink shadow-elevada transition hover:shadow-flotante">
          <span>{esAdmin ? "Detalle del equipo" : "Detalle de mi rendimiento"}</span>
          <span className="text-[0.7rem] font-medium text-slate group-open:hidden">Ver tabla</span>
          <span className="hidden text-[0.7rem] font-medium text-slate group-open:inline">Ocultar</span>
        </summary>
      <Tarjeta className="mt-3 !ring-0 shadow-elevada">
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
              <Th numerica>Respuesta media</Th>
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
                  <Td numerica>
                    <span className="block">{duracionRespuesta(fila.respuestaMediaMinutos)}</span>
                    {fila.respuestasChatwootMedidas > 0 && (
                      <span className="block text-[0.67rem] text-slate-400">{numero(fila.respuestasChatwootMedidas)} eventos</span>
                    )}
                  </Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
      </details>
    </>
  );
}

function suma(filas: FilaRendimiento[], campo: "leadsAsignados" | "cierresPeriodo" | "cierresCohorte" | "montoCerrado" | "expedientesEnTramite" | "montoEnTramite") {
  return filas.reduce((total, fila) => total + fila[campo], 0);
}

function promedioPonderado(
  filas: FilaRendimiento[],
  valor: "tiempoMedioCierreDias" | "primeraRespuestaMinutos" | "respuestaMediaMinutos",
  peso: "cierresPeriodo" | "respuestasMedidas" | "respuestasChatwootMedidas",
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

function duracionSegundos(segundos: number | null) {
  return segundos === null ? "—" : duracionRespuesta(segundos / 60);
}

function timestampChatwoot(timestamp: number) {
  const milisegundos = timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(milisegundos).toISOString();
}

function MetricaCompacta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <article className="rounded-2xl bg-mist/70 px-3.5 py-3 shadow-tarjeta">
      <p className="text-[0.61rem] font-semibold uppercase tracking-[0.07em] text-slate">{rotulo}</p>
      <p className="cifra mt-1.5 truncate text-[1.05rem] font-semibold text-ink">{valor}</p>
    </article>
  );
}

function IndicadorRespuesta({
  rotulo,
  valor,
  muestra,
}: {
  rotulo: string;
  valor: string;
  muestra: number;
}) {
  return (
    <div className="rounded-2xl bg-teal-50 px-4 py-3.5 shadow-tarjeta">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.07em] text-teal-700">{rotulo}</p>
      <p className="cifra mt-2 text-[1.3rem] font-semibold leading-none text-ink">{valor}</p>
      <p className="mt-2 text-[0.65rem] text-slate-400">
        {muestra > 0 ? `${numero(muestra)} ${muestra === 1 ? "medición" : "mediciones"}` : "Sin base atribuible"}
      </p>
    </div>
  );
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
