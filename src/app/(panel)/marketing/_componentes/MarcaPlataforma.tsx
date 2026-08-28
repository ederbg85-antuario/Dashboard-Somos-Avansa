type Plataforma = "avansa" | "meta" | "search" | "instagram" | "analytics" | "calendario";

const ETIQUETAS: Record<Plataforma, string> = {
  avansa: "Avansa Marketing",
  meta: "Meta Ads",
  search: "Google Search Console",
  instagram: "Instagram",
  analytics: "Google Analytics",
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
      <svg {...comun} fill="none">
        <path d="M5 7.5A3.5 3.5 0 0 1 8.5 4h15A3.5 3.5 0 0 1 27 7.5v15a3.5 3.5 0 0 1-3.5 3.5h-15A3.5 3.5 0 0 1 5 22.5v-15Z" fill="#4285F4" />
        <path d="M5 10h22v12.5a3.5 3.5 0 0 1-3.5 3.5h-15A3.5 3.5 0 0 1 5 22.5V10Z" fill="#5F9AF3" />
        <path d="M10 21v-4m5 4v-7m5 7v-10" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M9 8h2m3 0h9" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity=".92" />
      </svg>
    );
  }

  if (plataforma === "analytics") {
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

  return (
    <svg {...comun} fill="none">
      <path d="M6 8.5c2.6-3.8 7.5-5.7 11.8-3.5 4.2 2.2 5.8 7.3 3.6 11.5-2.1 4.1-7.2 5.9-11.4 3.8" stroke="#FF4D6D" strokeWidth="4" strokeLinecap="round" />
      <path d="M9 18c-3.4 1.3-5 4.2-3.8 6.8 1.4 3 5.5 3.7 9.1 1.6 3.7-2.1 5.5-6.3 4.1-9.3" stroke="#2FB6A3" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

