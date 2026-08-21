import type {
  ActividadTipo, CampanaEstado, DocumentoEstatus, EstatusMovimiento,
  LeadClasificacion, LeadEstado, NaturalezaCuenta, RolUsuario,
} from "@/lib/supabase/tipos";

/**
 * Vocabulario del sistema: cómo se llama y de qué color es cada cosa.
 *
 * La base guarda claves (`diagnostico`); la pantalla muestra etiquetas
 * (`Diagnóstico`). Ese puente vive aquí y en ningún otro lado, para que
 * renombrar una etapa sea editar una línea.
 */

// ---------- pipeline comercial -------------------------------------------

export type DefinicionEtapa = {
  clave: LeadEstado;
  nombre: string;
  descripcion: string;
  color: string;
  /** Probabilidad de cierre por defecto al llegar a la etapa. */
  probabilidad: number;
  /** `false` para las dos etapas terminales: no forman columna de trabajo. */
  enTablero: boolean;
};

/**
 * El pipeline calca el proceso que avansa publica en su sitio: diagnóstico →
 * clasificación A/B/C/D → expediente → revisión → trámite. Se agregan `nuevo`
 * y `contactado` al inicio, que es lo que ocurre antes de que exista un
 * diagnóstico, y los dos cierres al final.
 */
export const ETAPAS: DefinicionEtapa[] = [
  { clave: "nuevo",       nombre: "Nuevo",         descripcion: "Entró la solicitud. Nadie la ha tomado.",        color: "#6B7785", probabilidad: 5,   enTablero: true },
  { clave: "contactado",  nombre: "Contactado",    descripcion: "Ya hubo primer contacto por teléfono o WhatsApp.", color: "#0F2D3D", probabilidad: 15,  enTablero: true },
  { clave: "diagnostico", nombre: "Diagnóstico",   descripcion: "Revisando elegibilidad, saldo y proyecto.",       color: "#FF4D6D", probabilidad: 30,  enTablero: true },
  { clave: "expediente",  nombre: "Expediente",    descripcion: "Integrando identidad, banco, tenencia y obra.",   color: "#D9AE83", probabilidad: 55,  enTablero: true },
  { clave: "revision",    nombre: "Revisión",      descripcion: "Doble validación antes de darlo por listo.",      color: "#2FB6A3", probabilidad: 75,  enTablero: true },
  { clave: "tramite",     nombre: "Trámite",       descripcion: "La persona firma ante Infonavit; nosotros guiamos.", color: "#1E9E8D", probabilidad: 90, enTablero: true },
  { clave: "cerrado",     nombre: "Cerrado",       descripcion: "Servicio concluido y cobrado.",                   color: "#127C6E", probabilidad: 100, enTablero: false },
  { clave: "descartado",  nombre: "Descartado",    descripcion: "No procede o la persona no continuó.",            color: "#9AA5B1", probabilidad: 0,   enTablero: false },
];

export const ETAPA = Object.fromEntries(
  ETAPAS.map((e) => [e.clave, e]),
) as Record<LeadEstado, DefinicionEtapa>;

/** Las columnas del tablero kanban, en orden. */
export const ETAPAS_TABLERO = ETAPAS.filter((e) => e.enTablero);

/** Etapas que cuentan como pipeline vivo (ni cerrado ni descartado). */
export const ETAPAS_ABIERTAS = ETAPAS_TABLERO.map((e) => e.clave);

/**
 * Orden de avance de una etapa. `descartado` vale −1: no es un paso del
 * recorrido sino una salida, y por eso nunca cuenta como «llegó hasta aquí».
 */
export const ORDEN_ETAPA: Record<LeadEstado, number> = {
  nuevo: 0, contactado: 1, diagnostico: 2, expediente: 3,
  revision: 4, tramite: 5, cerrado: 6, descartado: -1,
};

/**
 * Embudo acumulado: cuántos expedientes **alcanzaron** cada etapa.
 *
 * El conteo por columna del tablero no sirve para un embudo — una etapa puede
 * tener más expedientes parados que la anterior y salen conversiones
 * imposibles. Lo que convierte es «llegó hasta aquí o más lejos», y para eso
 * se lee `etapa_maxima`: un expediente descartado salió en algún punto del
 * recorrido, y esa salida tiene que verse justo donde ocurrió y no
 * desaparecer del embudo.
 */
export function embudoAcumulado(
  leads: { etapa_maxima: LeadEstado }[],
): { clave: LeadEstado; nombre: string; color: string; total: number }[] {
  return ETAPAS.filter((e) => e.clave !== "descartado").map((e) => ({
    clave: e.clave,
    nombre: e.nombre,
    color: e.color,
    total: leads.filter((l) => ORDEN_ETAPA[l.etapa_maxima] >= ORDEN_ETAPA[e.clave]).length,
  }));
}

// ---------- clasificación de viabilidad ----------------------------------

export const CLASIFICACIONES: Record<
  LeadClasificacion,
  { nombre: string; descripcion: string; color: string }
> = {
  A: { nombre: "A · Listo para integrar", descripcion: "Sin bloqueos. Arranca el expediente hoy.",            color: "#2FB6A3" },
  B: { nombre: "B · Viable con pendientes", descripcion: "Elegible, pero faltan documentos o definir la obra.", color: "#D9AE83" },
  C: { nombre: "C · Todavía no",          descripcion: "Hay un bloqueo que resolver antes de mover nada.",     color: "#FF4D6D" },
  D: { nombre: "D · Fuera de alcance",    descripcion: "No es el producto. Se le indica a dónde sí acudir.",   color: "#6B7785" },
};

// ---------- expediente ----------------------------------------------------

/**
 * Checklist que se crea al abrir un expediente. Sale tal cual de los
 * requisitos publicados en el sitio (`web/src/lib/content.ts`).
 */
export const EXPEDIENTE_BASE: { nombre: string; grupo: "personales" | "vivienda" }[] = [
  { nombre: "Solicitud de inscripción de crédito",                grupo: "personales" },
  { nombre: "Identificación oficial vigente o CURP biométrica",   grupo: "personales" },
  { nombre: "Acta de nacimiento",                                 grupo: "personales" },
  { nombre: "CURP",                                               grupo: "personales" },
  { nombre: "RFC",                                                grupo: "personales" },
  { nombre: "Comprobante de domicilio (máximo 3 meses)",          grupo: "personales" },
  { nombre: "Estado de cuenta con CLABE a su nombre",             grupo: "personales" },
  { nombre: "Registro en AFORE con biométricos actualizados",     grupo: "personales" },
  { nombre: "Proyecto de obra y presupuesto",                     grupo: "vivienda" },
  { nombre: "Documento de legítima tenencia o posesión segura",   grupo: "vivienda" },
  { nombre: "Cadena de actas (si la vivienda no está a su nombre)", grupo: "vivienda" },
  { nombre: "Presupuesto de notaría (si usa el 30 % de regularización)", grupo: "vivienda" },
];

/**
 * Usos elegibles del crédito, tal como se publican en el sitio
 * (`web/src/lib/content.ts`). Se repiten aquí para que la captura interna use
 * exactamente el mismo vocabulario que la persona leyó antes de escribir.
 */
export const USOS_MEJORA = [
  "Pintura e impermeabilización",
  "Pisos, azulejos y acabados",
  "Instalaciones hidráulicas y eléctricas",
  "Reparaciones y ampliaciones",
  "Cocina y baño",
  "Impermeabilización de azotea",
  "Jardín y adecuaciones",
] as const;

export const ESTATUS_DOCUMENTO: Record<DocumentoEstatus, { nombre: string; color: string }> = {
  pendiente: { nombre: "Pendiente", color: "#6B7785" },
  recibido:  { nombre: "Recibido",  color: "#D9AE83" },
  validado:  { nombre: "Validado",  color: "#2FB6A3" },
  rechazado: { nombre: "Rechazado", color: "#FF4D6D" },
};

// ---------- actividades ---------------------------------------------------

export const TIPOS_ACTIVIDAD: Record<ActividadTipo, { nombre: string; icono: string }> = {
  llamada:  { nombre: "Llamada",  icono: "telefono" },
  whatsapp: { nombre: "WhatsApp", icono: "whatsapp" },
  correo:   { nombre: "Correo",   icono: "correo" },
  reunion:  { nombre: "Reunión",  icono: "usuarios" },
  nota:     { nombre: "Nota",     icono: "nota" },
  sistema:  { nombre: "Sistema",  icono: "sistema" },
};

// ---------- marketing -----------------------------------------------------

export const ESTADOS_CAMPANA: Record<CampanaEstado, { nombre: string; color: string }> = {
  borrador:   { nombre: "Borrador",   color: "#6B7785" },
  activa:     { nombre: "Activa",     color: "#2FB6A3" },
  pausada:    { nombre: "Pausada",    color: "#D9AE83" },
  finalizada: { nombre: "Finalizada", color: "#9AA5B1" },
};

/** Objetivos de Meta que usa avansa, en el orden del embudo. */
export const OBJETIVOS_META = [
  "Reconocimiento",
  "Tráfico",
  "Interacción",
  "Clientes potenciales",
  "Mensajes",
  "Conversiones",
] as const;

// ---------- finanzas ------------------------------------------------------

/**
 * Los renglones del estado de resultados, en el orden en que se restan.
 * `lib/finanzas.ts` recorre exactamente esta lista para armar la cascada.
 */
export const NATURALEZAS: Record<
  NaturalezaCuenta,
  { nombre: string; corto: string; color: string; ayuda: string }
> = {
  ingreso: {
    nombre: "Ingresos", corto: "Ingresos", color: "#2FB6A3",
    ayuda: "Todo lo cobrado por el servicio.",
  },
  costo_directo: {
    nombre: "Costo directo del servicio", corto: "Costo directo", color: "#FF4D6D",
    ayuda: "Lo que cuesta atender un expediente concreto. Define el margen bruto.",
  },
  gasto_marketing: {
    nombre: "Marketing y pauta", corto: "Marketing", color: "#E63A58",
    ayuda: "Pauta, contenido y herramientas de adquisición.",
  },
  gasto_operativo: {
    nombre: "Gastos de operación", corto: "Operación", color: "#0F2D3D",
    ayuda: "Nómina operativa, software y conectividad.",
  },
  gasto_administrativo: {
    nombre: "Gastos de administración", corto: "Administración", color: "#6B7785",
    ayuda: "Renta, servicios, contabilidad y dirección.",
  },
  depreciacion: {
    nombre: "Depreciación y amortización", corto: "Depreciación", color: "#D9AE83",
    ayuda: "No es salida de efectivo: por eso va debajo del EBITDA.",
  },
  financiero: {
    nombre: "Gastos financieros", corto: "Financieros", color: "#C79A6E",
    ayuda: "Comisiones bancarias e intereses.",
  },
  impuestos: {
    nombre: "Impuestos", corto: "Impuestos", color: "#A8804F",
    ayuda: "ISR, provisiones y contribuciones sobre nómina.",
  },
};

/** Las tres partidas que se suman como gasto operativo del EBITDA. */
export const NATURALEZAS_OPERATIVAS: NaturalezaCuenta[] = [
  "gasto_marketing", "gasto_operativo", "gasto_administrativo",
];

export const ESTATUS_MOVIMIENTO: Record<EstatusMovimiento, { nombre: string; color: string }> = {
  pagado:    { nombre: "Pagado",    color: "#2FB6A3" },
  pendiente: { nombre: "Pendiente", color: "#D9AE83" },
  cancelado: { nombre: "Cancelado", color: "#9AA5B1" },
};

export const METODOS_PAGO = [
  "Transferencia", "Efectivo", "Tarjeta de crédito", "Tarjeta de débito",
  "Depósito", "Cheque", "Domiciliado",
] as const;

// ---------- equipo --------------------------------------------------------

export const ROLES: Record<RolUsuario, { nombre: string; descripcion: string; color: string }> = {
  admin: {
    nombre: "Administrador", color: "#FF4D6D",
    descripcion: "Ve y edita todo, incluidas finanzas y el equipo.",
  },
  asesor: {
    nombre: "Asesor", color: "#0F2D3D",
    descripcion: "Trabaja el CRM y los expedientes. No ve finanzas.",
  },
  marketing: {
    nombre: "Marketing", color: "#E63A58",
    descripcion: "Administra campañas y métricas de pauta. No ve finanzas.",
  },
  finanzas: {
    nombre: "Finanzas", color: "#2FB6A3",
    descripcion: "Captura movimientos y consulta el estado de resultados.",
  },
};

/** Quién puede entrar a cada módulo. Gobierna el menú y las páginas. */
export const ACCESO_MODULOS: Record<string, RolUsuario[]> = {
  resumen:    ["admin", "asesor", "marketing", "finanzas"],
  solicitudes:["admin", "asesor", "marketing", "finanzas"],
  // Marketing y finanzas no atienden leads: la bandeja lleva conversaciones
  // con personas reales y no hay razón para que la vean.
  conversaciones:["admin", "asesor"],
  crm:        ["admin", "asesor", "marketing", "finanzas"],
  marketing:  ["admin", "asesor", "marketing", "finanzas"],
  finanzas:   ["admin", "finanzas"],
  reportes:   ["admin", "finanzas"],
  equipo:     ["admin"],
  ajustes:    ["admin", "finanzas"],
};

// ---------- estados de la República --------------------------------------

export const ESTADOS_MX = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de México", "Coahuila", "Colima", "Durango",
  "Estado de México", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "Michoacán", "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla",
  "Querétaro", "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora",
  "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas",
] as const;

/** Aviso obligatorio de cumplimiento; se repite en el pie del panel. */
export const DISCLAIMER =
  "El trámite ante Infonavit es gratuito y cualquier persona puede realizarlo por su " +
  "cuenta. avansa es una empresa privada e independiente de acompañamiento y gestión " +
  "documental. No es Infonavit ni forma parte del Gobierno.";
