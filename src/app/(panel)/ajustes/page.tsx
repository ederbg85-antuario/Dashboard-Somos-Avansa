import type { Metadata } from "next";
import { Encabezado } from "@/components/panel/Encabezado";
import { CabezaTarjeta, Tarjeta } from "@/components/ui/Tarjeta";
import { Insignia, Punto } from "@/components/ui/Insignia";
import { Icono } from "@/components/ui/Icono";
import { Encabezados, Fila, Tabla, Td, Th } from "@/components/ui/Tabla";
import { NATURALEZAS } from "@/lib/constantes";
import { dinero, inicioDeMes, mes as nombreMes, numero } from "@/lib/formato";
import { categorias as cargarCategorias } from "@/lib/datos";
import { metaConfigurado } from "@/lib/meta/insights";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import { BorrarDemo, MetaDelMes, NuevaCategoria } from "./Formularios";

export const metadata: Metadata = { title: "Ajustes" };
export const dynamic = "force-dynamic";

export default async function Ajustes() {
  const { perfil } = await exigirRol("admin", "finanzas");
  const supabase = await clienteServidor();

  const [categorias, { data: metas }, { count: demos }] = await Promise.all([
    cargarCategorias(),
    supabase.from("metas").select("*").order("periodo", { ascending: false }).limit(12),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("es_demo", true),
  ]);

  const metaActual = (metas ?? []).find((m) => m.periodo === inicioDeMes()) ?? null;

  const porNaturaleza = (Object.keys(NATURALEZAS) as (keyof typeof NATURALEZAS)[])
    .map((n) => ({ naturaleza: n, cuentas: categorias.filter((c) => c.naturaleza === n) }))
    .filter((g) => g.cuentas.length > 0);

  return (
    <>
      <Encabezado
        titulo="Ajustes"
        apoyo="El plan de cuentas, las metas del mes y el estado de las conexiones del sistema."
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Tarjeta>
            <CabezaTarjeta
              titulo="Plan de cuentas"
              apoyo="Cada categoría declara en qué renglón del estado de resultados cae. Cambiar esa clasificación recalcula margen bruto, EBITDA y utilidad neta de todo el histórico, sin migrar un solo dato."
              accion={<span className="cifra text-[0.8rem] font-semibold text-slate">{numero(categorias.length)}</span>}
            />
            <div className="mt-4 space-y-4">
              {porNaturaleza.map(({ naturaleza, cuentas }) => (
                <div key={naturaleza}>
                  <h3 className="mb-2 flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.08em]"
                      style={{ color: NATURALEZAS[naturaleza].color }}>
                    <Punto color={NATURALEZAS[naturaleza].color} />
                    {NATURALEZAS[naturaleza].nombre}
                  </h3>
                  <p className="mb-2 text-[0.74rem] leading-snug text-slate">{NATURALEZAS[naturaleza].ayuda}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {cuentas.map((c) => (
                      <li key={c.id}>
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-mist px-2.5 py-1.5 text-[0.76rem] text-ink"
                              title={c.descripcion ?? undefined}>
                          <span className="size-2 rounded-full" style={{ background: c.color }} />
                          {c.nombre}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta titulo="Metas por mes" apoyo="Dan el denominador de los avances del tablero." />
            {(metas ?? []).length === 0 ? (
              <p className="mt-3 rounded-xl bg-mist px-3.5 py-3 text-[0.8rem] text-slate">
                Todavía no hay metas. Define la del mes en curso con el formulario de la derecha.
              </p>
            ) : (
              <Tabla className="mt-3">
                <Encabezados>
                  <Th>Mes</Th>
                  <Th numerica>Ingresos</Th>
                  <Th numerica>Solicitudes</Th>
                  <Th numerica>Cierres</Th>
                  <Th numerica>CPL objetivo</Th>
                </Encabezados>
                <tbody>
                  {(metas ?? []).map((m) => (
                    <Fila key={m.id}>
                      <Td><span className="font-medium capitalize text-ink">{nombreMes(m.periodo)}</span></Td>
                      <Td numerica>{dinero(m.ingresos_meta)}</Td>
                      <Td numerica>{numero(m.leads_meta)}</Td>
                      <Td numerica>{numero(m.cierres_meta)}</Td>
                      <Td numerica>{m.cpl_meta ? dinero(m.cpl_meta) : "—"}</Td>
                    </Fila>
                  ))}
                </tbody>
              </Tabla>
            )}
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <CabezaTarjeta titulo="Conexiones" apoyo="De dónde entra y a dónde sale la información." />
            <ul className="mt-4 space-y-2.5">
              <Conexion
                activa
                titulo="Sitio web · somosavansa.com"
                detalle="El formulario del sitio escribe directo en la tabla de solicitudes. No hay que exportar ni copiar nada."
              />
              <Conexion
                activa
                titulo="Supabase"
                detalle="Base de datos, sesiones y permisos por rol. Las políticas de la base aplican aunque alguien escriba la URL a mano."
              />
              <Conexion
                activa={metaConfigurado()}
                titulo="Meta Marketing API"
                detalle={
                  metaConfigurado()
                    ? "Configurada. El módulo de Marketing puede sincronizar impresiones, clics, gasto y leads por campaña y día."
                    : "Sin configurar. Define META_ACCESS_TOKEN y META_AD_ACCOUNT_ID en el entorno; mientras tanto la captura manual funciona igual."
                }
              />
            </ul>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta titulo={`Meta de ${nombreMes(inicioDeMes())}`}
                           apoyo="Se puede editar cuantas veces haga falta." />
            <div className="mt-4"><MetaDelMes actual={metaActual} /></div>
          </Tarjeta>

          <Tarjeta>
            <CabezaTarjeta titulo="Nueva categoría" apoyo="Sólo si el plan de cuentas se queda corto." />
            <div className="mt-4"><NuevaCategoria /></div>
          </Tarjeta>

          {perfil.rol === "admin" && (
            <Tarjeta>
              <CabezaTarjeta
                titulo="Datos de demostración"
                apoyo="Contenido de ejemplo para recorrer el sistema antes de operar."
              />
              <div className="mt-4"><BorrarDemo cuantos={demos ?? 0} /></div>
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}

function Conexion({ activa, titulo, detalle }: { activa: boolean; titulo: string; detalle: string }) {
  return (
    <li className="rounded-xl bg-mist p-3.5">
      <p className="flex items-center justify-between gap-2 text-[0.84rem] font-semibold text-ink">
        <span className="flex items-center gap-2">
          <Icono nombre={activa ? "cheque" : "alerta"}
                 className={`size-4 ${activa ? "text-teal" : "text-sand"}`} />
          {titulo}
        </span>
        <Insignia color={activa ? "#2FB6A3" : "#D9AE83"}>
          {activa ? "Conectado" : "Pendiente"}
        </Insignia>
      </p>
      <p className="mt-1.5 text-[0.76rem] leading-relaxed text-slate">{detalle}</p>
    </li>
  );
}
