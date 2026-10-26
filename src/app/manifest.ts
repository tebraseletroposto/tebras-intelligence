import type { MetadataRoute } from "next";

/** Manifesto do aplicativo instalável (PWA): permite instalar o Tebras Intelligence no celular e no computador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tebras Intelligence",
    short_name: "Tebras Intelligence",
    description: "Inteligência geográfica, demanda e viabilidade financeira de Tebras Smart Hubs.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0C0B0E",
    theme_color: "#0C0B0E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
