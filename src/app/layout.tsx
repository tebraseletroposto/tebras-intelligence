import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tebras Intelligence", template: "%s · Tebras Intelligence" },
  description: "Tebras Intelligence — inteligência geográfica, demanda e viabilidade de Tebras Smart Hubs",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Tebras Intelligence", statusBarStyle: "black" },
};

export const viewport: Viewport = { themeColor: "#0c0b0e" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}<ServiceWorkerRegister /></body>
    </html>
  );
}
