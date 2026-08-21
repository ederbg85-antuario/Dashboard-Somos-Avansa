import type { NombreIcono } from "@/components/ui/Icono";
import { ACCESO_MODULOS } from "@/lib/constantes";
import type { RolUsuario } from "@/lib/supabase/tipos";

/**
 * El menú del panel.
 *
 * Está agrupado por lo que la persona viene a hacer, no por tabla de la base:
 * primero atender gente, luego traerla, luego cobrarla y al final administrar
 * el sistema. Cada entrada declara su módulo, y el módulo decide qué roles lo
 * ven (`ACCESO_MODULOS`), de modo que ocultar el menú y bloquear la página
 * usan la misma fuente.
 */
export type Entrada = {
  href: string;
  etiqueta: string;
  icono: NombreIcono;
  modulo: keyof typeof ACCESO_MODULOS;
  /** Marca la entrada como activa también en sus subrutas. */
  prefijo?: boolean;
  descripcion: string;
};

export type Grupo = { titulo: string; entradas: Entrada[] };

export const MENU: Grupo[] = [
  {
    titulo: "Operación",
    entradas: [
      { href: "/", etiqueta: "Resumen", icono: "tablero", modulo: "resumen",
        descripcion: "El estado del negocio hoy" },
      { href: "/solicitudes", etiqueta: "Solicitudes", icono: "bandeja", modulo: "solicitudes", prefijo: true,
        descripcion: "Lo que llega del sitio web" },
      { href: "/conversaciones", etiqueta: "Conversaciones", icono: "conversacion", modulo: "conversaciones", prefijo: true,
        descripcion: "WhatsApp del equipo" },
      { href: "/crm", etiqueta: "CRM", icono: "embudo", modulo: "crm", prefijo: true,
        descripcion: "Pipeline y expedientes" },
    ],
  },
  {
    titulo: "Crecimiento",
    entradas: [
      { href: "/marketing", etiqueta: "Marketing", icono: "megafono", modulo: "marketing", prefijo: true,
        descripcion: "Campañas de Meta Ads" },
    ],
  },
  {
    titulo: "Dinero",
    entradas: [
      { href: "/finanzas", etiqueta: "Finanzas", icono: "monedas", modulo: "finanzas", prefijo: true,
        descripcion: "Ingresos, egresos y márgenes" },
      { href: "/reportes", etiqueta: "Estado de resultados", icono: "reporte", modulo: "reportes",
        descripcion: "La cascada completa, mes a mes" },
    ],
  },
  {
    titulo: "Sistema",
    entradas: [
      { href: "/equipo", etiqueta: "Equipo", icono: "equipo", modulo: "equipo",
        descripcion: "Personas y permisos" },
      { href: "/ajustes", etiqueta: "Ajustes", icono: "ajustes", modulo: "ajustes",
        descripcion: "Catálogos y metas" },
    ],
  },
];

/** El menú recortado a lo que el rol puede abrir. */
export function menuPara(rol: RolUsuario): Grupo[] {
  return MENU
    .map((g) => ({ ...g, entradas: g.entradas.filter((e) => ACCESO_MODULOS[e.modulo].includes(rol)) }))
    .filter((g) => g.entradas.length > 0);
}

/** `true` si el rol puede abrir el módulo. */
export const puede = (rol: RolUsuario, modulo: keyof typeof ACCESO_MODULOS) =>
  ACCESO_MODULOS[modulo].includes(rol);
