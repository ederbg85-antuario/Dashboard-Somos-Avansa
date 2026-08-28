import "server-only";

import type { ResumenGoogle } from "@/lib/google/insights";

type Analitica = NonNullable<ResumenGoogle["analitica"]>;

const CANALES: Record<string, string> = {
  "Organic Search": "Búsqueda orgánica",
  "Paid Search": "Búsqueda pagada",
  "Organic Social": "Redes orgánicas",
  "Paid Social": "Redes pagadas",
  Direct: "Directo",
  Referral: "Sitios referidos",
  Email: "Correo",
  Display: "Anuncios gráficos",
  Affiliates: "Afiliados",
  Unassigned: "Sin clasificar",
  "(other)": "Otros",
};

export function nombreCanal(nombre: string) {
  return CANALES[nombre] ?? nombre.replace(/^\(not set\)$/i, "Sin clasificar");
}

/**
 * El sitio público define estos nombres en su catálogo de medición. Leerlos
 * por nombre evita presentar un evento genérico como si fuera un formulario.
 */
export function resultadosMedidos(analitica: Analitica) {
  const formularios = analitica.eventosDisponibles
    ? analitica.eventosDetalle
        .filter((evento) => evento.nombre === "generate_lead")
        .reduce((suma, evento) => suma + evento.total, 0)
    : null;

  const clicsWhatsapp = analitica.contactosPorCanal === null
    ? null
    : analitica.contactosPorCanal
        .filter((contacto) => contacto.canal.toLowerCase() === "whatsapp")
        .reduce((suma, contacto) => suma + contacto.total, 0);

  return { formularios, clicsWhatsapp };
}

export function duracionBreve(segundos: number | null) {
  if (segundos === null || !Number.isFinite(segundos)) return "—";
  const total = Math.max(0, Math.round(segundos));
  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return minutos > 0 ? `${minutos} min ${resto} s` : `${resto} s`;
}
