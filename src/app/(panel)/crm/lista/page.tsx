import Link from "next/link";
import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { BotonEnlace } from "@/components/ui/Boton";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { CLASIFICACIONES, ETAPA, ETAPAS } from "@/lib/constantes";
import { dineroCorto, fecha, numero } from "@/lib/formato";
import { nombresDelEquipo, pipelineCompleto } from "@/lib/datos";
import { exigirSesion } from "@/lib/supabase/sesion";

export const metadata: Metadata = { title: "Todos los expedientes" };
export const dynamic = "force-dynamic";

/**
 * La misma información del tablero, en tabla.
 *
 * El kanban sirve para trabajar el día; para buscar a alguien, exportar o
 * revisar doscientos expedientes de corrido, una tabla ordenable es mucho
 * mejor herramienta. Conviven a propósito.
 */
export default async function ListaExpedientes({
  searchParams,
}: {
  searchParams: Promise<{ etapa?: string; q?: string; clase?: string }>;
}) {
  await exigirSesion();
  const { etapa, q, clase } = await searchParams;

  const [todos, equipo] = await Promise.all([pipelineCompleto(), nombresDelEquipo()]);

  const filas = todos.filter((l) => {
    if (etapa && l.estado !== etapa) return false;
    if (clase && l.clasificacion !== clase) return false;
    if (q && !`${l.nombre} ${l.telefono} ${l.email ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <Encabezado
        titulo="Todos los expedientes"
        apoyo={`${numero(filas.length)} de ${numero(todos.length)} expedientes registrados.`}
        acciones={
          <BotonEnlace href="/crm" tono="claro">
            <Icono nombre="embudo" className="size-4" />
            Ver como tablero
          </BotonEnlace>
        }
      >
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip href="/crm/lista" activo={!etapa && !clase}>Todos</Chip>
          {ETAPAS.map((e) => (
            <Chip key={e.clave} href={`/crm/lista?etapa=${e.clave}`} activo={etapa === e.clave} color={e.color}>
              {e.nombre}
            </Chip>
          ))}
        </div>
      </Encabezado>

      <Tarjeta className="animate-entrar !ring-0 shadow-elevada">
        {filas.length === 0 ? (
          <Vacio icono="buscar" titulo="Nada coincide con este filtro"
                 texto="Prueba con otra etapa o quita el filtro."
                 accion={<BotonEnlace href="/crm/lista" tamano="sm" tono="claro">Ver todos</BotonEnlace>} />
        ) : (
          <Tabla>
            <Encabezados>
              <Th>Persona</Th>
              <Th>Etapa</Th>
              <Th>Clase</Th>
              <Th>Asesor</Th>
              <Th>Estado</Th>
              <Th numerica>Saldo declarado</Th>
              <Th numerica>Honorarios</Th>
              <Th numerica>Entró</Th>
            </Encabezados>
            <tbody>
              {filas.map((l) => (
                <Fila key={l.id}>
                  <Td>
                    <Link href={`/crm/${l.id}`} className="block min-w-0">
                      <span className="block truncate font-semibold text-ink hover:text-coral">{l.nombre}</span>
                      <span className="cifra block truncate text-[0.72rem] text-slate">{l.telefono}</span>
                    </Link>
                  </Td>
                  <Td><Insignia color={ETAPA[l.estado].color}>{ETAPA[l.estado].nombre}</Insignia></Td>
                  <Td>
                    {l.clasificacion ? (
                      <span className="grid size-5 place-items-center rounded-md text-[0.65rem] font-bold text-white"
                            style={{ background: CLASIFICACIONES[l.clasificacion].color }}
                            title={CLASIFICACIONES[l.clasificacion].nombre}>
                        {l.clasificacion}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                  </Td>
                  <Td>
                    <span className="text-slate">
                      {l.asesor_id ? equipo.get(l.asesor_id)?.nombre ?? "—" : "Sin dueño"}
                    </span>
                  </Td>
                  <Td><span className="text-slate">{l.estado_republica ?? "—"}</span></Td>
                  <Td numerica>{l.saldo_subcuenta ? dineroCorto(l.saldo_subcuenta) : "—"}</Td>
                  <Td numerica>{l.valor_estimado ? dineroCorto(l.valor_estimado) : "—"}</Td>
                  <Td numerica><span className="text-slate">{fecha(l.created_at)}</span></Td>
                </Fila>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}

function Chip({
  href, activo, children, color,
}: { href: string; activo: boolean; children: React.ReactNode; color?: string }) {
  return (
    <Link href={href}
          className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[0.74rem] font-semibold transition ${
            activo ? "bg-deep text-white" : "bg-white text-slate ring-1 ring-hair hover:text-ink"
          }`}>
      {color && <span className="size-2 rounded-full" style={{ background: activo ? "#fff" : color }} />}
      {children}
    </Link>
  );
}
