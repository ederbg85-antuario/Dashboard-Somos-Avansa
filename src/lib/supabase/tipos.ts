/**
 * Tipos de la base de datos.
 *
 * Escritos a mano para que reflejen el esquema de `supabase/migrations/` con
 * comentarios en español. Pueden regenerarse en cualquier momento con:
 *
 *   npx supabase gen types typescript --project-id vbvycgwxhsoaqionyrgc > src/lib/supabase/tipos.ts
 *
 * Se usan alias `type` y no `interface`: supabase-js exige que las filas
 * encajen en `Record<string, unknown>` y sólo los alias tienen index
 * signature implícita.
 */

// ---------- enums ---------------------------------------------------------

export type RolUsuario = "admin" | "asesor" | "marketing" | "finanzas";

export type LeadEstado =
  | "nuevo"
  | "contactado"
  | "diagnostico"
  | "expediente"
  | "revision"
  | "tramite"
  | "cerrado"
  | "descartado";

/** Clasificación interna de viabilidad. A = listo · D = fuera de alcance. */
export type LeadClasificacion = "A" | "B" | "C" | "D";

export type ActividadTipo =
  | "llamada" | "whatsapp" | "correo" | "reunion" | "nota" | "sistema";

export type DocumentoEstatus = "pendiente" | "recibido" | "validado" | "rechazado";

export type CampanaEstado = "borrador" | "activa" | "pausada" | "finalizada";

export type TipoMovimiento = "ingreso" | "egreso";

/** Renglón del estado de resultados donde cae cada peso. */
export type NaturalezaCuenta =
  | "ingreso"
  | "costo_directo"
  | "gasto_operativo"
  | "gasto_marketing"
  | "gasto_administrativo"
  | "depreciacion"
  | "financiero"
  | "impuestos";

export type EstatusMovimiento = "pagado" | "pendiente" | "cancelado";

// ---------- filas ---------------------------------------------------------

export type Perfil = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: RolUsuario;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  estado_republica: string | null;
  /** Saldo *declarado* por la persona; avansa nunca consulta Infonavit. */
  saldo_subcuenta: number | null;
  tipo_mejora: string | null;
  vivienda_a_su_nombre: boolean | null;
  mensaje: string | null;
  acepta_privacidad: boolean;
  origen: string | null;
  canal: string | null;
  utm: Record<string, string> | null;
  campana_id: string | null;
  estado: LeadEstado;
  /** Etapa más lejana alcanzada. Nunca retrocede; es la base del embudo. */
  etapa_maxima: LeadEstado;
  clasificacion: LeadClasificacion | null;
  asesor_id: string | null;
  valor_estimado: number | null;
  probabilidad: number | null;
  proxima_accion: string | null;
  fecha_proxima_accion: string | null;
  motivo_descarte: string | null;
  cerrado_en: string | null;
  notas_internas: string | null;
  es_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type Actividad = {
  id: string;
  lead_id: string;
  autor_id: string | null;
  tipo: ActividadTipo;
  titulo: string;
  detalle: string | null;
  ocurrio_en: string;
  created_at: string;
};

export type Documento = {
  id: string;
  lead_id: string;
  nombre: string;
  grupo: string;
  estatus: DocumentoEstatus;
  vence_el: string | null;
  url: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type Campana = {
  id: string;
  nombre: string;
  plataforma: string;
  meta_campaign_id: string | null;
  objetivo: string | null;
  estado: CampanaEstado;
  publico: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto_diario: number | null;
  notas: string | null;
  es_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type MetricaCampana = {
  id: string;
  campana_id: string;
  fecha: string;
  impresiones: number;
  alcance: number;
  clics: number;
  gasto: number;
  leads: number;
  conversaciones: number;
  es_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoriaFinanzas = {
  id: string;
  nombre: string;
  tipo: TipoMovimiento;
  naturaleza: NaturalezaCuenta;
  color: string;
  descripcion: string | null;
  activo: boolean;
  orden: number;
  created_at: string;
};

export type Movimiento = {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  categoria_id: string;
  concepto: string;
  monto: number;
  iva: number;
  metodo_pago: string | null;
  referencia: string | null;
  estatus: EstatusMovimiento;
  lead_id: string | null;
  campana_id: string | null;
  notas: string | null;
  creado_por: string | null;
  es_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type Invitacion = {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolUsuario;
  invitada_por: string | null;
  usada_en: string | null;
  created_at: string;
};

export type Meta = {
  id: string;
  periodo: string;
  ingresos_meta: number;
  leads_meta: number;
  cierres_meta: number;
  cpl_meta: number | null;
  created_at: string;
  updated_at: string;
};

// ---------- vistas --------------------------------------------------------

export type FilaPipeline = {
  estado: LeadEstado;
  total: number;
  valor_estimado: number;
  valor_ponderado: number;
  clasificacion_a: number;
};

export type FilaMarketingCampana = {
  campana_id: string;
  nombre: string;
  estado: CampanaEstado;
  objetivo: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto_diario: number | null;
  impresiones: number;
  alcance: number;
  clics: number;
  gasto: number;
  leads: number;
  conversaciones: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpl: number | null;
};

// ---------- contrato para supabase-js -------------------------------------

type Tabla<Fila, Alta = Partial<Fila>> = {
  Row: Fila;
  Insert: Alta;
  Update: Partial<Fila>;
  Relationships: [];
};

type Vista<Fila> = { Row: Fila; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      perfiles: Tabla<Perfil>;
      leads: Tabla<Lead>;
      actividades: Tabla<Actividad>;
      documentos: Tabla<Documento>;
      campanas: Tabla<Campana>;
      metricas_campana: Tabla<MetricaCampana>;
      categorias_finanzas: Tabla<CategoriaFinanzas>;
      movimientos: Tabla<Movimiento>;
      metas: Tabla<Meta>;
      invitaciones: Tabla<Invitacion>;
    };
    Views: {
      v_pipeline: Vista<FilaPipeline>;
      v_marketing_campana: Vista<FilaMarketingCampana>;
    };
    Functions: {
      /** `true` cuando ya existe al menos un perfil de equipo. */
      hay_equipo: { Args: Record<string, never>; Returns: boolean };
      /** Rol de quien consulta, o `null` si no es del equipo. */
      mi_rol: { Args: Record<string, never>; Returns: RolUsuario | null };
    };
    Enums: {
      rol_usuario: RolUsuario;
      lead_estado: LeadEstado;
      lead_clasificacion: LeadClasificacion;
      actividad_tipo: ActividadTipo;
      documento_estatus: DocumentoEstatus;
      campana_estado: CampanaEstado;
      tipo_movimiento: TipoMovimiento;
      naturaleza_cuenta: NaturalezaCuenta;
      estatus_movimiento: EstatusMovimiento;
    };
    CompositeTypes: Record<never, never>;
  };
};
