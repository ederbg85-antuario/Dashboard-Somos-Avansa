import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // El panel vive detrás de sesión: nada que revalidar en caché compartida.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
