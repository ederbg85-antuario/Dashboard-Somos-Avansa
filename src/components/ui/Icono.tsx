type Props = {
  nombre: NombreIcono;
  className?: string;
  /** Grosor del trazo. El isotipo de avansa usa trazo uniforme y remate redondo. */
  grosor?: number;
};

/**
 * Iconografía del panel.
 *
 * Un solo sistema: trazo uniforme, remates y uniones redondas, sin relleno.
 * Es la misma gramática con la que está construido el isotipo — tres cápsulas
 * y un trazo en U — así que los iconos se sienten de la misma familia sin
 * tener que imitar la mano.
 */
const TRAZOS: Record<string, React.ReactNode> = {
  tablero: <><rect x="3" y="3" width="7" height="8" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="11" width="7" height="10" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /></>,
  bandeja: <><path d="M3 13h4l1.5 3h7L17 13h4" /><path d="M4.5 6.5 3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5l-1.5-6.5A2 2 0 0 0 17.6 5H6.4a2 2 0 0 0-1.9 1.5Z" /></>,
  embudo: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></>,
  megafono: <><path d="M4 9v6h3l7 4V5L7 9H4Z" /><path d="M17.5 8.5a5 5 0 0 1 0 7" /><path d="M20 6a9 9 0 0 1 0 12" /></>,
  monedas: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" /><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" /></>,
  reporte: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  equipo: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6" /><path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77M19.07 19.07l-1.77-1.77M6.7 6.7 4.93 4.93" /></>,
  salir: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h11" /></>,
  buscar: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  mas: <><path d="M12 5v14M5 12h14" /></>,
  menos: <><path d="M5 12h14" /></>,
  cheque: <><path d="m4.5 12.5 4.5 4.5L19.5 6.5" /></>,
  cruz: <><path d="M6 6l12 12M18 6 6 18" /></>,
  subir: <><path d="M12 19V5" /><path d="m5.5 11.5 6.5-6.5 6.5 6.5" /></>,
  bajar: <><path d="M12 5v14" /><path d="m5.5 12.5 6.5 6.5 6.5-6.5" /></>,
  telefono: <><path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6L16.5 13l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 5.7a2 2 0 0 1 2-2.2Z" /></>,
  whatsapp: <><path d="M3.5 20.5 5 16.4A8.2 8.2 0 1 1 8 19.3l-4.5 1.2Z" /><path d="M9 9.2c.3 1.2.8 2.2 1.7 3.1.9.9 1.9 1.4 3.1 1.7l1-1.3 1.9.8v1.4c0 .6-.5 1.1-1.1 1a8.6 8.6 0 0 1-6.7-6.7c-.1-.6.4-1.1 1-1.1h1.4l.8 1.9L9 9.2Z" /></>,
  correo: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  usuarios: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  nota: <><path d="M5 3.5h9.5L19 8v12.5H5Z" /><path d="M14 3.5V8h5" /><path d="M8.5 12.5h7M8.5 16h4.5" /></>,
  sistema: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  calendario: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  filtro: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  descargar: <><path d="M12 3.5v11" /><path d="m7.5 10 4.5 4.5 4.5-4.5" /><path d="M4.5 17.5v1a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-1" /></>,
  editar: <><path d="M4 20h4L19 9a2.6 2.6 0 0 0-3.7-3.7L4 16.5V20Z" /><path d="m14.5 6.5 3.2 3.2" /></>,
  basura: <><path d="M4.5 6.5h15" /><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" /><path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" /></>,
  alerta: <><path d="M12 4 2.8 20h18.4L12 4Z" /><path d="M12 10v4.5M12 17.4v.1" /></>,
  reloj: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.3 2" /></>,
  casa: <><path d="m3.5 10.5 8.5-7 8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  ubicacion: <><path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2.3" /></>,
  enlace: <><path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.4 6.4" /><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.4-1.4" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  volver: <><path d="M15 6 9 12l6 6" /></>,
  destello: <><path d="M13 3 5 13.5h5.5L11 21l8-10.5h-5.5L13 3Z" /></>,
  escudo: <><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m9.2 12 2 2 3.6-3.6" /></>,
  carpeta: <><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2.5h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11Z" /></>,
  ojo: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" /></>,
  candado: <><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
};

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, className = "size-5", grosor = 1.7 }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
