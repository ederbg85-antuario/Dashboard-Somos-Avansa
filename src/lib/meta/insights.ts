import "server-only";

/**
 * Cliente de la Marketing API de Meta.
 *
 * Trae el desempeño diario por campaña y lo deja en la forma exacta de
 * `metricas_campana`. No guarda nada: quien llama decide con qué sesión
 * escribe, y por eso la sincronización respeta RLS como cualquier otra
 * escritura del panel.
 *
 * Funciona en cuanto existan `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID`. Sin
 * ellas, `sincronizarInsights` avisa que falta configurar en vez de fallar:
 * el módulo de marketing sirve igual con captura manual.
 */

const VERSION = process.env.META_API_VERSION ?? "v26.0";

export type FilaInsight = {
  meta_campaign_id: string;
  nombre: string;
  fecha: string;
  impresiones: number;
  alcance: number;
  clics: number;
  gasto: number;
  leads: number;
  conversaciones: number;
};

export const metaConfigurado = () =>
  Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);

/** Suma los `actions` cuyo tipo coincide con alguno de los buscados. */
function contarAcciones(acciones: { action_type: string; value: string }[] | undefined, tipos: string[]) {
  if (!acciones) return 0;
  return acciones
    .filter((a) => tipos.includes(a.action_type))
    .reduce((s, a) => s + (Number(a.value) || 0), 0);
}

export async function traerInsights(desde: string, hasta: string): Promise<FilaInsight[]> {
  const token = process.env.META_ACCESS_TOKEN;
  const cuenta = process.env.META_AD_ACCOUNT_ID;
  if (!token || !cuenta) throw new Error("Falta META_ACCESS_TOKEN o META_AD_ACCOUNT_ID.");

  // `act_` sólo si no viene ya en la variable: es el error de configuración
  // más común y no vale la pena que cueste una hora de depuración.
  const id = cuenta.startsWith("act_") ? cuenta : `act_${cuenta}`;

  const parametros = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,impressions,reach,clicks,spend,actions",
    time_range: JSON.stringify({ since: desde, until: hasta }),
    time_increment: "1",          // una fila por campaña y por día
    limit: "500",
    access_token: token,
  });

  const filas: FilaInsight[] = [];
  let url: string | null = `https://graph.facebook.com/${VERSION}/${id}/insights?${parametros}`;

  // La Graph API pagina; se sigue el cursor hasta agotarlo.
  while (url) {
    const respuesta: Response = await fetch(url, { cache: "no-store" });
    const cuerpo = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(cuerpo?.error?.message ?? `Meta respondió ${respuesta.status}.`);
    }

    for (const d of cuerpo.data ?? []) {
      filas.push({
        meta_campaign_id: String(d.campaign_id),
        nombre: String(d.campaign_name ?? "Campaña sin nombre"),
        fecha: String(d.date_start),
        impresiones: Number(d.impressions) || 0,
        alcance: Number(d.reach) || 0,
        clics: Number(d.clicks) || 0,
        gasto: Number(d.spend) || 0,
        // Meta reporta el lead con varios nombres según el tipo de anuncio y
        // la versión del pixel; se suman todos los equivalentes.
        leads: contarAcciones(d.actions, [
          "lead",
          "offsite_conversion.fb_pixel_lead",
          "onsite_conversion.lead_grouped",
        ]),
        conversaciones: contarAcciones(d.actions, [
          "onsite_conversion.messaging_conversation_started_7d",
        ]),
      });
    }

    url = cuerpo.paging?.next ?? null;
  }

  return filas;
}
