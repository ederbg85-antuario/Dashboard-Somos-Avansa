"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { exigirSesion } from "@/lib/supabase/sesion";
import { EXPEDIENTE_BASE, ETAPA } from "@/lib/constantes";
import type { ActividadTipo, DocumentoEstatus, LeadClasificacion, LeadEstado } from "@/lib/supabase/tipos";

/**
 * Acciones del CRM.
 *
 * Todas pasan por `exigirSesion()` y escriben con la sesión de la persona, de
 * modo que RLS sigue siendo la última palabra: si alguien llamara a una de
 * estas funciones sin permiso, la base la rechaza aunque el formulario se
 * haya saltado.
 *
 * Nada aquí borra: descartar un expediente es un cambio de etapa con motivo,
 * no un `delete`. El historial de por qué se cayó un trámite vale más que la
 * fila que ocupa.
 */

export type Resultado = { ok: true; aviso?: string } | { ok: false; error: string };

const texto = (fd: FormData, campo: string, max = 400) => {
  const v = String(fd.get(campo) ?? "").trim().slice(0, max);
  return v.length ? v : null;
};

const numeroOpcional = (fd: FormData, campo: string) => {
  const v = Number(fd.get(campo));
  return Number.isFinite(v) && v >= 0 ? v : null;
};

function refrescar(id?: string) {
  revalidatePath("/");
  revalidatePath("/crm");
  revalidatePath("/solicitudes");
  if (id) revalidatePath(`/crm/${id}`);
}

// ---------- pipeline ------------------------------------------------------

/**
 * Mueve un expediente de etapa.
 *
 * La probabilidad se recalcula sola con el valor por defecto de la etapa
 * destino, salvo que alguien la haya ajustado a mano: el pronóstico de un
 * pipeline en el que nadie mantiene probabilidades no sirve para nada.
 */
export async function cambiarEtapa(
  id: string,
  estado: LeadEstado,
  motivo?: string,
): Promise<Resultado> {
  await exigirSesion();
  const supabase = await clienteServidor();

  const { error } = await supabase
    .from("leads")
    .update({
      estado,
      probabilidad: ETAPA[estado].probabilidad,
      motivo_descarte: estado === "descartado" ? (motivo ?? null) : null,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  refrescar(id);
  return { ok: true, aviso: `Movido a ${ETAPA[estado].nombre}.` };
}

/** Versión para `<form action=…>` del tablero. */
export async function moverEtapa(datos: FormData): Promise<void> {
  const id = String(datos.get("id"));
  const estado = String(datos.get("estado")) as LeadEstado;
  await cambiarEtapa(id, estado, texto(datos, "motivo") ?? undefined);
}

export async function actualizarLead(datos: FormData): Promise<Resultado> {
  const sesion = await exigirSesion();
  const supabase = await clienteServidor();
  const id = String(datos.get("id"));
  if (!id) return { ok: false, error: "Falta el expediente." };

  const clasificacion = texto(datos, "clasificacion") as LeadClasificacion | null;
  const asesor = texto(datos, "asesor_id");

  const { error } = await supabase
    .from("leads")
    .update({
      nombre: texto(datos, "nombre", 120) ?? undefined,
      telefono: texto(datos, "telefono", 30) ?? undefined,
      email: texto(datos, "email", 160),
      estado_republica: texto(datos, "estado_republica", 60),
      tipo_mejora: texto(datos, "tipo_mejora", 80),
      saldo_subcuenta: numeroOpcional(datos, "saldo_subcuenta"),
      vivienda_a_su_nombre:
        datos.get("vivienda_a_su_nombre") === "si" ? true
        : datos.get("vivienda_a_su_nombre") === "no" ? false : null,
      clasificacion,
      // Cadena vacía = «sin asignar»; `null` en la base, no la cadena "".
      asesor_id: asesor,
      valor_estimado: numeroOpcional(datos, "valor_estimado"),
      proxima_accion: texto(datos, "proxima_accion", 160),
      fecha_proxima_accion: texto(datos, "fecha_proxima_accion", 10),
      notas_internas: texto(datos, "notas_internas", 4000),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  // Deja rastro de quién tocó el expediente: la bitácora es la memoria del
  // pipeline y una edición silenciosa la vuelve inútil.
  await supabase.from("actividades").insert({
    lead_id: id,
    autor_id: sesion.usuarioId,
    tipo: "sistema",
    titulo: "Ficha actualizada",
  });

  refrescar(id);
  return { ok: true, aviso: "Cambios guardados." };
}

// ---------- bitácora ------------------------------------------------------

export async function registrarActividad(datos: FormData): Promise<Resultado> {
  const sesion = await exigirSesion();
  const supabase = await clienteServidor();

  const lead_id = String(datos.get("lead_id"));
  const titulo = texto(datos, "titulo", 160);
  if (!lead_id || !titulo) return { ok: false, error: "Escribe de qué se trató el contacto." };

  const { error } = await supabase.from("actividades").insert({
    lead_id,
    autor_id: sesion.usuarioId,
    tipo: (texto(datos, "tipo") ?? "nota") as ActividadTipo,
    titulo,
    detalle: texto(datos, "detalle", 4000),
  });

  if (error) return { ok: false, error: error.message };
  refrescar(lead_id);
  return { ok: true, aviso: "Actividad registrada." };
}

// ---------- expediente ----------------------------------------------------

/**
 * Crea el checklist del expediente con los requisitos publicados en el sitio.
 * Es idempotente: si ya existen documentos, no duplica nada.
 */
export async function abrirExpediente(leadId: string): Promise<Resultado> {
  await exigirSesion();
  const supabase = await clienteServidor();

  const { count } = await supabase
    .from("documentos")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if ((count ?? 0) > 0) return { ok: true, aviso: "El expediente ya estaba abierto." };

  const { error } = await supabase.from("documentos").insert(
    EXPEDIENTE_BASE.map((d) => ({ lead_id: leadId, nombre: d.nombre, grupo: d.grupo })),
  );

  if (error) return { ok: false, error: error.message };
  refrescar(leadId);
  return { ok: true, aviso: "Expediente abierto con los 12 documentos base." };
}

export async function abrirExpedienteForm(datos: FormData): Promise<void> {
  await abrirExpediente(String(datos.get("lead_id")));
}

export async function cambiarDocumento(datos: FormData): Promise<void> {
  await exigirSesion();
  const supabase = await clienteServidor();
  const id = String(datos.get("id"));
  const lead_id = String(datos.get("lead_id"));

  await supabase
    .from("documentos")
    .update({
      estatus: String(datos.get("estatus")) as DocumentoEstatus,
      vence_el: texto(datos, "vence_el", 10),
      notas: texto(datos, "notas", 500),
    })
    .eq("id", id);

  refrescar(lead_id);
}

// ---------- alta manual ---------------------------------------------------

/** Para el lead que llega por teléfono o recomendación, no por el sitio. */
export async function crearLead(datos: FormData): Promise<Resultado> {
  const sesion = await exigirSesion();
  const supabase = await clienteServidor();

  const nombre = texto(datos, "nombre", 120);
  const telefono = texto(datos, "telefono", 30);

  if (!nombre || nombre.length < 2) return { ok: false, error: "Escribe el nombre completo." };
  if (!telefono || (telefono.match(/\d/g) ?? []).length < 10) {
    return { ok: false, error: "El teléfono necesita 10 dígitos." };
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      nombre,
      telefono,
      email: texto(datos, "email", 160),
      estado_republica: texto(datos, "estado_republica", 60),
      saldo_subcuenta: numeroOpcional(datos, "saldo_subcuenta"),
      tipo_mejora: texto(datos, "tipo_mejora", 80),
      mensaje: texto(datos, "mensaje", 1200),
      // El consentimiento es una restricción de la base: sin él no puede
      // existir el registro. Quien da de alta a mano declara haberlo obtenido.
      acepta_privacidad: true,
      origen: texto(datos, "origen", 60) ?? "captura-manual",
      canal: texto(datos, "canal", 60),
      asesor_id: sesion.usuarioId,
      estado: "contactado",
      probabilidad: ETAPA.contactado.probabilidad,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  refrescar();
  return { ok: true, aviso: `Expediente de ${nombre} creado.` };
}
