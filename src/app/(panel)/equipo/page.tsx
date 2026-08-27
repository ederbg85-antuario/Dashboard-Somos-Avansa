import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Vacio } from "@/components/ui/Vacio";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { ROLES } from "@/lib/constantes";
import { fecha, iniciales, numero } from "@/lib/formato";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { equipo as cargarEquipo, pipelineCompleto } from "@/lib/datos";
import type { Invitacion } from "@/lib/supabase/tipos";
import { cambiarActivo, cambiarRol, cancelarInvitacion } from "./acciones";
import { Invitar } from "./Invitar";

export const metadata: Metadata = { title: "Equipo" };
export const dynamic = "force-dynamic";

export default async function Equipo() {
  const sesion = await exigirRol("admin");
  const supabase = await clienteServidor();

  const [personas, { data: invitaciones }, pipeline] = await Promise.all([
    cargarEquipo(),
    supabase.from("invitaciones").select("*").is("usada_en", null).order("created_at", { ascending: false }),
    pipelineCompleto(),
  ]);

  const pendientes = (invitaciones ?? []) as Invitacion[];

  // Carga de trabajo: expedientes abiertos por asesor.
  const carga = new Map<string, number>();
  for (const l of pipeline) {
    if (l.estado === "cerrado" || l.estado === "descartado" || !l.asesor_id) continue;
    carga.set(l.asesor_id, (carga.get(l.asesor_id) ?? 0) + 1);
  }
  const cerradosPor = new Map<string, number>();
  for (const l of pipeline) {
    if (l.estado !== "cerrado" || !l.asesor_id) continue;
    cerradosPor.set(l.asesor_id, (cerradosPor.get(l.asesor_id) ?? 0) + 1);
  }

  return (
    <>
      <Encabezado
        titulo="Equipo"
        apoyo="Administradores ven todo; cada asesor recibe y ve únicamente sus propios leads, conversaciones y pipeline."
      />

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Tarjeta>
            <CabezaTarjeta
              titulo="Personas"
              apoyo={`${numero(personas.filter((p) => p.activo).length)} activas de ${numero(personas.length)}.`}
            />
            <Tabla className="mt-3">
              <Encabezados>
                <Th>Persona</Th>
                <Th>Rol</Th>
                <Th numerica>Abiertos</Th>
                <Th numerica>Cerrados</Th>
                <Th>Estado</Th>
              </Encabezados>
              <tbody>
                {personas.map((p) => {
                  const yo = p.id === sesion.usuarioId;
                  return (
                    <Fila key={p.id} className={p.activo ? "" : "opacity-55"}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full text-[0.7rem] font-semibold text-white"
                                style={{ background: ROLES[p.rol].color }}>
                            {iniciales(p.nombre)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink">
                              {p.nombre} {p.apellidos}{yo && <span className="ml-1.5 text-[0.7rem] font-normal text-slate">(tú)</span>}
                            </span>
                            <span className="block truncate text-[0.72rem] text-slate">{p.email}</span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <form action={cambiarRol}>
                          <input type="hidden" name="id" value={p.id} />
                          <select
                            name="rol"
                            defaultValue={p.rol}
                            aria-label={`Rol de ${p.nombre}`}
                            className="h-8 cursor-pointer rounded-lg bg-mist px-2 text-[0.74rem] font-semibold text-ink transition hover:bg-hair focus:outline-none focus:ring-2 focus:ring-coral"
                          >
                            {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => (
                              <option key={r} value={r}>{ROLES[r].nombre}</option>
                            ))}
                          </select>
                          <button type="submit"
                                  className="ml-1 rounded-lg px-2 py-1 text-[0.7rem] font-semibold text-coral transition hover:bg-coral-50">
                            Guardar
                          </button>
                        </form>
                      </Td>
                      <Td numerica>{numero(carga.get(p.id) ?? 0)}</Td>
                      <Td numerica>{numero(cerradosPor.get(p.id) ?? 0)}</Td>
                      <Td>
                        {yo ? (
                          <Insignia color="#2FB6A3">Activa</Insignia>
                        ) : (
                          <form action={cambiarActivo}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="activo" value={p.activo ? "no" : "si"} />
                            <button
                              type="submit"
                              className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold transition ${
                                p.activo
                                  ? "bg-teal-50 text-teal-700 hover:bg-coral-50 hover:text-coral"
                                  : "bg-mist text-slate hover:bg-teal-50 hover:text-teal-700"
                              }`}
                              title={p.activo ? "Dar de baja" : "Reactivar"}
                            >
                              {p.activo ? "Activa" : "De baja"}
                            </button>
                          </form>
                        )}
                      </Td>
                    </Fila>
                  );
                })}
              </tbody>
            </Tabla>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta
              titulo="Qué ve cada rol"
              apoyo="No es sólo el menú: las políticas de la base aplican lo mismo."
            />
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {(Object.keys(ROLES) as (keyof typeof ROLES)[]).map((r) => (
                <li key={r} className="rounded-xl bg-mist p-3.5">
                  <p className="flex items-center gap-2 text-[0.84rem] font-semibold text-ink">
                    <span className="size-2.5 rounded-full" style={{ background: ROLES[r].color }} />
                    {ROLES[r].nombre}
                  </p>
                  <p className="mt-1 text-[0.76rem] leading-relaxed text-slate">{ROLES[r].descripcion}</p>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <CabezaTarjeta
              titulo="Invitar a alguien"
              apoyo="El correo brandeado permite crear la contraseña y completar el perfil. Sin invitación vigente, la base rechaza el alta."
            />
            <div className="mt-4"><Invitar /></div>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta titulo="Invitaciones sin usar" apoyo={`${numero(pendientes.length)} pendientes.`} />
            {pendientes.length === 0 ? (
              <Vacio icono="correo" titulo="Ninguna pendiente"
                     texto="Todas las invitaciones enviadas ya se usaron." />
            ) : (
              <ul className="mt-3 divide-y divide-hair">
                {pendientes.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.82rem] font-medium text-ink">{i.email}</span>
                      <span className="block text-[0.72rem] text-slate">
                        {ROLES[i.rol].nombre} · invitada el {fecha(i.created_at)}
                      </span>
                    </span>
                    <form action={cancelarInvitacion}>
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit"
                              className="grid size-7 place-items-center rounded-lg text-slate transition hover:bg-coral-50 hover:text-coral"
                              aria-label={`Cancelar invitación de ${i.email}`} title="Cancelar">
                        <Icono nombre="basura" className="size-3.5" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
