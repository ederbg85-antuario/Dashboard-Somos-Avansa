"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirRol } from "@/lib/supabase/sesion";
import type { EstatusMovimiento, TipoMovimiento } from "@/lib/supabase/tipos";

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const texto = (fd: FormData, campo: string, max = 200) => {
  const v = String(fd.get(campo) ?? "").trim().slice(0, max);
  return v.length ? v : null;
};

function refrescar() {
  revalidatePath("/finanzas");
  revalidatePath("/reportes");
  revalidatePath("/");
}

/**
 * Alta o edición de un movimiento.
 *
 * El monto se guarda **sin IVA** y el IVA aparte: metido en el mismo campo,
 * los márgenes saldrían inflados un 16 % y el estado de resultados dejaría de
 * cuadrar contra la contabilidad. El `tipo` no se pregunta — lo define la
 * categoría, y un trigger de la base rechaza cualquier combinación imposible.
 */
export async function guardarMovimiento(datos: FormData): Promise<Resultado> {
  const sesion = await exigirRol("admin", "finanzas");
  const supabase = await clienteServidor();

  const categoria_id = texto(datos, "categoria_id", 40);
  const concepto = texto(datos, "concepto", 200);
  const monto = Number(datos.get("monto"));

  if (!categoria_id) return { ok: false, error: "Elige una categoría." };
  if (!concepto || concepto.length < 2) return { ok: false, error: "Escribe el concepto." };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto tiene que ser mayor que cero." };

  const { data: categoria } = await supabase
    .from("categorias_finanzas").select("tipo, nombre").eq("id", categoria_id).single();

  if (!categoria) return { ok: false, error: "Esa categoría ya no existe." };

  const iva = Number(datos.get("iva"));
  const fila = {
    fecha: texto(datos, "fecha", 10) ?? new Date().toISOString().slice(0, 10),
    tipo: categoria.tipo as TipoMovimiento,
    categoria_id,
    concepto,
    monto,
    iva: Number.isFinite(iva) && iva > 0 ? iva : 0,
    metodo_pago: texto(datos, "metodo_pago", 40),
    referencia: texto(datos, "referencia", 80),
    estatus: (texto(datos, "estatus") ?? "pagado") as EstatusMovimiento,
    lead_id: texto(datos, "lead_id", 40),
    campana_id: texto(datos, "campana_id", 40),
    notas: texto(datos, "notas", 1000),
    creado_por: sesion.usuarioId,
  };

  const id = texto(datos, "id", 40);
  const { error } = id
    ? await supabase.from("movimientos").update(fila).eq("id", id)
    : await supabase.from("movimientos").insert(fila);

  if (error) return { ok: false, error: error.message };

  refrescar();
  return {
    ok: true,
    aviso: `${categoria.tipo === "ingreso" ? "Ingreso" : "Egreso"} de ${concepto} registrado.`,
  };
}

/**
 * Marca un movimiento como pagado o cancelado.
 *
 * Cancelar no borra: la fila se queda con su historia y deja de contar para
 * el resultado. En finanzas, borrar es perder la pista de por qué cambió una
 * cifra entre dos cierres.
 */
export async function cambiarEstatusMovimiento(datos: FormData): Promise<void> {
  await exigirRol("admin", "finanzas");
  const supabase = await clienteServidor();

  await supabase
    .from("movimientos")
    .update({ estatus: String(datos.get("estatus")) as EstatusMovimiento })
    .eq("id", String(datos.get("id")));

  refrescar();
}

// ---------- catálogo ------------------------------------------------------

export async function guardarCategoria(datos: FormData): Promise<Resultado> {
  await exigirRol("admin", "finanzas");
  const supabase = await clienteServidor();

  const nombre = texto(datos, "nombre", 80);
  const naturaleza = texto(datos, "naturaleza", 40);
  if (!nombre) return { ok: false, error: "La categoría necesita nombre." };
  if (!naturaleza) return { ok: false, error: "Elige en qué renglón del resultado cae." };

  // El tipo se deduce de la naturaleza: sólo `ingreso` es ingreso.
  const tipo: TipoMovimiento = naturaleza === "ingreso" ? "ingreso" : "egreso";

  const { error } = await supabase.from("categorias_finanzas").insert({
    nombre,
    tipo,
    naturaleza: naturaleza as "ingreso",
    color: texto(datos, "color", 9) ?? "#6B7785",
    descripcion: texto(datos, "descripcion", 300),
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe una categoría con ese nombre." : error.message,
    };
  }

  revalidatePath("/ajustes");
  refrescar();
  return { ok: true, aviso: `Categoría «${nombre}» creada.` };
}

export async function guardarMeta(datos: FormData): Promise<Resultado> {
  await exigirRol("admin", "finanzas");
  const supabase = await clienteServidor();

  const periodo = texto(datos, "periodo", 10);
  if (!periodo) return { ok: false, error: "Elige el mes." };

  const { error } = await supabase.from("metas").upsert(
    {
      // Un `<input type="month">` manda `2026-08`; la base exige el día 1.
      periodo: periodo.length === 7 ? `${periodo}-01` : periodo,
      ingresos_meta: Math.max(0, Number(datos.get("ingresos_meta")) || 0),
      leads_meta: Math.max(0, Math.round(Number(datos.get("leads_meta")) || 0)),
      cierres_meta: Math.max(0, Math.round(Number(datos.get("cierres_meta")) || 0)),
      cpl_meta: Math.max(0, Number(datos.get("cpl_meta")) || 0) || null,
    },
    { onConflict: "periodo" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/ajustes");
  refrescar();
  return { ok: true, aviso: "Meta del mes guardada." };
}
