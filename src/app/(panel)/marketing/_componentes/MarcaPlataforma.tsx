import Image from "next/image";

export type Plataforma = "avansa" | "meta" | "search" | "instagram" | "analytics" | "sitio" | "calendario";

const ETIQUETAS: Record<Plataforma, string> = {
  avansa: "Avansa Marketing",
  meta: "Publicidad en Meta",
  search: "SEO en Google",
  instagram: "Instagram",
  analytics: "Sitio web",
  sitio: "Sitio web",
  calendario: "Calendario editorial",
};

/**
 * Identificadores vectoriales locales. No cargan SDKs, tipografías ni
 * imágenes de terceros; sólo ayudan a reconocer la fuente de cada dato.
 */
export function MarcaPlataforma({
  plataforma,
  className = "size-6",
}: {
  plataforma: Plataforma;
  className?: string;
}) {
  const comun = {
    className,
    viewBox: "0 0 32 32",
    role: "img" as const,
    "aria-label": ETIQUETAS[plataforma],
  };

  if (plataforma === "meta") {
    return (
      <svg {...comun} fill="none">
        <path d="M4 20.5c2.2-7.7 5.1-12 8-12 3.8 0 6.4 12 9.8 12 2.3 0 4.2-2.5 6.2-7.3" stroke="#1877F2" strokeWidth="3.1" strokeLinecap="round" />
        <path d="M4 20.5c2.3 3.1 4.4 3.1 6.4 0 2.1-3.1 4.2-9.1 7.5-11.2 3.4-2.2 7.2.1 10.1 3.9" stroke="#0866FF" strokeWidth="3.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (plataforma === "instagram") {
    return (
      <svg {...comun} fill="none">
        <defs>
          <linearGradient id="ig-avansa" x1="3" y1="29" x2="29" y2="3" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F9CE34" />
            <stop offset=".48" stopColor="#EE2A7B" />
            <stop offset="1" stopColor="#6228D7" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="24" height="24" rx="7" stroke="url(#ig-avansa)" strokeWidth="3" />
        <circle cx="16" cy="16" r="5.5" stroke="url(#ig-avansa)" strokeWidth="3" />
        <circle cx="23.3" cy="8.8" r="1.5" fill="#A833B7" />
      </svg>
    );
  }

  if (plataforma === "search") {
    return (
      <svg className={className} viewBox="0 0 48 48" role="img" aria-label={ETIQUETAS[plataforma]}>
        <path fill="#FFC107" d="M43.6 20H42V20H24v8h11.3A12 12 0 0 1 12.7 32l-6.6 5.1A20 20 0 0 0 44 24c0-1.3-.1-2.7-.4-4Z" />
        <path fill="#FF3D00" d="m6.1 10.9 6.6 4.8A12 12 0 0 1 31.6 12l5.8-5.8A20 20 0 0 0 6.1 10.9Z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.1L31.2 33a11.9 11.9 0 0 1-18.5-5l-6.5 5A20 20 0 0 0 24 44Z" />
        <path fill="#1976D2" d="M43.6 20H42V20H24v8h11.3a12 12 0 0 1-4.1 5l6.2 5.9C41.2 35.4 44 30.3 44 24c0-1.3-.1-2.7-.4-4Z" />
      </svg>
    );
  }

  if (plataforma === "analytics" || plataforma === "sitio") {
    return (
      <svg {...comun} fill="none">
        <rect x="18" y="4" width="8" height="24" rx="4" fill="#F9AB00" />
        <rect x="8" y="13" width="7" height="15" rx="3.5" fill="#E37400" />
        <circle cx="4.5" cy="24.5" r="3.5" fill="#E37400" />
      </svg>
    );
  }

  if (plataforma === "calendario") {
    return (
      <svg {...comun} fill="none">
        <rect x="4" y="6" width="24" height="22" rx="6" fill="#FFF0F3" stroke="#FF4D6D" strokeWidth="2" />
        <path d="M4 12h24M10 3.5V8M22 3.5V8" stroke="#FF4D6D" strokeWidth="2.2" strokeLinecap="round" />
        <path d="m11 20 3 3 7-7" stroke="#2FB6A3" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return <Image src="/marca/isotipo/avansa-isotipo.svg" width={32} height={32} className={className} alt={ETIQUETAS.avansa} />;
}
