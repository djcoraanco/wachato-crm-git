import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { faviconHref } from "@/lib/favicon";
import { appIconHref, NAV_INK, shortAppName } from "@/lib/pwa";
import { RegistrarServiceWorker } from "@/components/pwa";
import { APARIENCIA_POR_DEFECTO, atributosHtml, cssDePropio, cssDeTemas } from "@/lib/temas";
import { aparienciaActual } from "@/server/apariencia";
import { getBranding } from "@/server/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import "./globals.css";

// Las fuentes llegan con las dependencias; el build no consulta Google Fonts.
const nunito = localFont({
  src: "../../node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2",
  weight: "200 1000",
  variable: "--font-nunito",
  display: "swap",
});
const jakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});
const urbanist = localFont({
  src: "../../node_modules/@fontsource-variable/urbanist/files/urbanist-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-urbanist",
  display: "swap",
});
const archivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-archivo",
  display: "swap",
});
// 062 — Las otras dos letras que se eligen en Ajustes → Apariencia.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const plexSans = localFont({
  src: "../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  weight: "100 700",
  variable: "--font-plex-sans",
  display: "swap",
});
const instrumentSerif = localFont({
  src: [
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
});
const plexMono = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const producto = productName([...enabledChannels()]);
  return {
    title: `${branding.name} — ${producto}`,
    description: `${producto} con agente de IA y Laboratorio de auto-evaluación`,
    // El `?v=` cambia con la marca: los navegadores guardan el favicon con una
    // insistencia notable y, sin eso, el logo nuevo tarda días en aparecer.
    icons: {
      icon: faviconHref(branding),
      // 048 — El icono de «Agregar a inicio» del iPhone: PNG de 180, a sangre.
      apple: appIconHref(branding, 180),
    },
    // 048 — Instalada desde Safari, abre sin la barra del navegador. Barra de
    // estado negra y no translúcida: la página no tiene margen para el notch.
    appleWebApp: { capable: true, title: shortAppName(branding.name), statusBarStyle: "black" },
  };
}

/** 048 — La barra de estado de la app instalada, del color de la barra lateral. */
export const viewport: Viewport = { themeColor: NAV_INK };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  // 062 · D6 — La apariencia (tema, letra, tamaño y densidad) se resuelve en
  // el servidor: el primer pintado ya la trae, sin parpadeo.
  const { apariencia } = await aparienciaActual().catch(() => ({
    apariencia: APARIENCIA_POR_DEFECTO,
  }));
  return (
    <html
      lang="es"
      className={`${nunito.variable} ${jakarta.variable} ${urbanist.variable} ${archivo.variable} ${inter.variable} ${plexSans.variable} ${instrumentSerif.variable} ${plexMono.variable}`}
      // La preferencia siempre es explícita: viaja resuelta en el HTML del
      // servidor, así que no hay divergencia con el cliente ni parpadeo.
      {...atributosHtml(apariencia)}
    >
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
        {/* 062 — Los temas listos (todos, para cambiar en vivo) y el propio. */}
        <style
          id="vocero-temas"
          dangerouslySetInnerHTML={{ __html: cssDeTemas() + cssDePropio(apariencia) }}
        />
      </head>
      <body className="font-sans">
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
