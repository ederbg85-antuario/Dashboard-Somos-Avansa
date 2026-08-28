import "server-only";

/**
 * Alcance aprobado por el usuario. Son plantillas internas: no llaman a Meta,
 * no crean anuncios y nunca incluyen una orden de activación.
 */
export const PLANES_CAMPANA = [
  {
    clave: "trafico-sitio",
    nombre: "Tráfico al sitio",
    objetivo: "Tráfico",
    presupuestoDiario: 200,
    audiencia: "Amplia en México · optimización automática",
    creativosRequeridos: 5,
    creativos: [
      "Hacemos fácil lo que parece difícil",
      "Fechas clave de tus documentos",
      "Tu hogar merece más",
      "Tu caso con claridad",
      "Instalaciones que mejoran",
    ],
    destino: "https://www.somosavansa.com/",
    conversiones: ["Formulario enviado", "Contacto por WhatsApp"],
    utm: "utm_source=meta&utm_medium=paid_social&utm_campaign=trafico_sitio&utm_content={{ad.name}}&utm_term={{adset.name}}",
  },
  {
    clave: "clientes-potenciales",
    nombre: "Clientes potenciales",
    objetivo: "Clientes potenciales",
    presupuestoDiario: 200,
    audiencia: "Amplia en México · optimización automática",
    creativosRequeridos: 5,
    creativos: [
      "Haz realidad tu remodelación",
      "Más de lo que imaginas",
      "Acompañamiento experto",
      "El impulso que tu hogar merece",
      "Monto para remodelar",
    ],
    destino: "https://www.somosavansa.com/",
    conversiones: ["Formulario enviado", "Contacto por WhatsApp"],
    utm: "utm_source=meta&utm_medium=paid_social&utm_campaign=clientes_potenciales&utm_content={{ad.name}}&utm_term={{adset.name}}",
  },
] as const;
