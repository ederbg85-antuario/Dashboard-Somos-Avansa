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

export type RolUsuario = "admin" | "asesor";

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

export type TipoContenidoSocial = "publicacion" | "historia" | "reel";
export type EstadoContenidoSocial = "borrador" | "programado" | "publicando" | "publicado" | "error";

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
  apellidos: string;
  email: string;
  telefono: string | null;
  rol: RolUsuario;
  activo: boolean;
  avatar_path: string | null;
  reparto_orden: number | null;
  recibe_leads: boolean;
  perfil_completo: boolean;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  nombre: string;
  telefono: string;
  email: string | null;
  submission_id: string | null;
  telefono_normalizado: string | null;
  credito_infonavit_activo: boolean | null;
  esta_en_buro_credito: boolean | null;
  institucion_buro: string | null;
  conoce_ahorro_vivienda: boolean | null;
  ahorro_vivienda_aprox: number | null;
  base_tratamiento: "consentimiento_web" | "contacto_iniciado_whatsapp" | "captura_interna";
  aviso_privacidad_version: string | null;
  consentido_en: string | null;
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

/** Una pieza editorial, aún cuando vaya a salir en las dos redes. */
export type ContenidoSocial = {
  id: string;
  titulo: string;
  texto: string;
  tipo: TipoContenidoSocial;
  plataformas: ("facebook" | "instagram")[];
  estado: EstadoContenidoSocial;
  programado_para: string | null;
  publicado_en: string | null;
  autorizado_en: string | null;
  autorizado_por: string | null;
  publicacion_intentos: number;
  siguiente_intento_en: string | null;
  bloqueado_hasta: string | null;
  lease_token: string | null;
  creado_por: string;
  actualizado_por: string | null;
  resultado_meta: Record<string, unknown>;
  error_publicacion: string | null;
  created_at: string;
  updated_at: string;
};

export type ContenidoMedio = {
  id: string;
  contenido_id: string;
  storage_path: string;
  mime_type: string;
  tipo_archivo: "imagen" | "video";
  orden: number;
  created_at: string;
};

/** Se lee exclusivamente con service_role; jamás se manda al navegador. */
export type IntegracionGoogle = {
  id: "principal";
  refresh_token: string;
  email: string | null;
  conectado_por: string | null;
  conectado_en: string;
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
  apellidos: string | null;
  rol: RolUsuario;
  reparto_orden: number | null;
  recibe_leads: boolean;
  invitada_por: string | null;
  usada_en: string | null;
  created_at: string;
};

/**
 * Reparto de una conversación de Chatwoot.
 *
 * El `id` es el de Chatwoot, no un serial nuestro: esta fila es el reflejo
 * local de algo que vive allá, y sólo guarda lo que allá no puede decidirse
 * —quién la atiende— porque el equipo no tiene usuario en Chatwoot.
 */
export type Conversacion = {
  id: number;
  bandeja_id: number;
  asignado_a: string | null;
  asignado_en: string | null;
  asignado_por: string | null;
  lead_id: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  ultima_actividad_en: string | null;
  created_at: string;
  updated_at: string;
};

/** Firma de un mensaje saliente: Chatwoot los recibe todos igual. */
export type Respuesta = {
  mensaje_id: number;
  conversacion_id: number;
  autor_id: string | null;
  enviado_en: string;
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
      contenidos_sociales: Tabla<ContenidoSocial>;
      contenido_medios: Tabla<ContenidoMedio>;
      integraciones_google: Tabla<IntegracionGoogle>;
      categorias_finanzas: Tabla<CategoriaFinanzas>;
      movimientos: Tabla<Movimiento>;
      metas: Tabla<Meta>;
      invitaciones: Tabla<Invitacion>;
      conversaciones: Tabla<Conversacion>;
      respuestas: Tabla<Respuesta>;
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
      /** Regla única de visibilidad de la bandeja; la comparten RLS y la API. */
      puede_ver_conversacion: { Args: { conv: number }; Returns: boolean };
      /** NSS descifrado sólo para admin o el asesor propietario; deja auditoría. */
      leer_nss: { Args: { p_lead_id: string }; Returns: string | null };
      registrar_lead_manual: {
        Args: {
          p_nombre: string;
          p_telefono: string;
          p_email: string | null;
          p_estado_republica: string | null;
          p_saldo_subcuenta: number | null;
          p_tipo_mejora: string | null;
          p_mensaje: string | null;
          p_origen: string;
          p_canal: string | null;
        };
        Returns: string;
      };
      registrar_conversacion_whatsapp: {
        Args: {
          p_conversacion_id: number;
          p_bandeja_id: number;
          p_nombre: string;
          p_telefono: string;
          p_email: string | null;
          p_mensaje_inicial: string | null;
        };
        Returns: { lead_id: string; asesor_id: string | null }[];
      };
      /** Reclamo atómico y cercado de una pieza lista para publicar. */
      reclamar_contenido_social: {
        Args: {
          p_id: string;
          p_ahora: string;
          p_bloqueado_hasta: string;
          p_lease_token: string;
        };
        Returns: ContenidoSocial[];
      };
    };
    Enums: {
      rol_usuario: RolUsuario;
      lead_estado: LeadEstado;
      lead_clasificacion: LeadClasificacion;
      actividad_tipo: ActividadTipo;
      documento_estatus: DocumentoEstatus;
      campana_estado: CampanaEstado;
      tipo_contenido_social: TipoContenidoSocial;
      estado_contenido_social: EstadoContenidoSocial;
      tipo_movimiento: TipoMovimiento;
      naturaleza_cuenta: NaturalezaCuenta;
      estatus_movimiento: EstatusMovimiento;
    };
    CompositeTypes: Record<never, never>;
  };
};
