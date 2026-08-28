import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const scriptTema = `
  (function () {
    try {
      var preferencia = localStorage.getItem("avansa:tema");
      var oscuro = preferencia === "dark" ||
        (preferencia !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = oscuro ? "dark" : "light";
      document.documentElement.style.colorScheme = oscuro ? "dark" : "light";
    } catch (_) {
      document.documentElement.dataset.theme = "light";
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
    "Sistema interno de avansa: CRM, campañas de Meta Ads y panel financiero.",
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
