import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const scriptTema = `
  (function () {
    try {
      var preferencia = localStorage.getItem("avansa:tema");
      var navegacion = localStorage.getItem("avansa:navegacion:v1");
      var oscuro = preferencia === "dark";
      document.documentElement.dataset.theme = oscuro ? "dark" : "light";
      document.documentElement.dataset.navegacion = navegacion === "compacta" ? "compacta" : "amplia";
      document.documentElement.style.colorScheme = oscuro ? "dark" : "light";
      var actualizarColor = function () {
        var metaTema = document.querySelector('meta[name="theme-color"]');
        if (metaTema) metaTema.setAttribute("content", oscuro ? "#081820" : "#0F2D3D");
      };
      actualizarColor();
      document.addEventListener("DOMContentLoaded", actualizarColor, { once: true });
    } catch (_) {
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.navegacion = "amplia";
      document.documentElement.style.colorScheme = "light";
    }
  })();
`;

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sistema integral · avansa",
    template: "%s · avansa",
  },
  description:
    "Sistema interno de avansa: CRM, publicidad y panel financiero.",
  icons: {
    icon: [
      { url: "/marca/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/marca/favicon/png/icon-32.png", sizes: "32x32" },
    ],
    apple: "/marca/favicon/png/icon-180.png",
  },
  // Es una herramienta interna: no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: "#0F2D3D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
