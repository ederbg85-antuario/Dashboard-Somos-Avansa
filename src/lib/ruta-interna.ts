const ORIGEN_CONTROL = "https://dashboard.somosavansa.com";

/**
 * Normaliza un destino relativo y rechaza variantes como `//sitio-externo` o
 * `/\\sitio-externo`, que el parser del navegador convertiría en otro origen.
 */
export function rutaInterna(valor: string | null | undefined, fallback: string): string {
  if (!valor?.startsWith("/")) return fallback;

  try {
    const url = new URL(valor, ORIGEN_CONTROL);
    if (url.origin !== ORIGEN_CONTROL) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
