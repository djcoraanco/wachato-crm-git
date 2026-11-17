"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { Apariencia } from "@/lib/temas";
import type { ResolvedCommit } from "@/lib/version";
import { AppNav } from "@/components/app-nav";
import { cn } from "@/lib/utils";
import { BandaSinConexion } from "@/components/banda-sin-conexion";
import { AtajosGlobales } from "@/components/atajos-globales";
import { navTitle } from "@/lib/nav";

/**
 * Cascarón de la app en dos modos:
 *
 * - Escritorio (lg+): el panel lateral es una columna fija de 228 px.
 * - Móvil/tableta: el lateral sale de la izquierda como cajón sobre un velo,
 *   y arriba queda la barra con el menú y el título de la vista. El
 *   cajón se cierra solo al navegar (el `pathname` cambia) y con Escape.
 *
 * La altura usa `100dvh` (no `100vh`) porque en el navegador móvil la barra de
 * direcciones se encoge al hacer scroll: con `vh` el compositor de la Bandeja
 * queda debajo del borde visible.
 */
export function AppShell({
  branding,
  organizationName,
  userName,
  role,
  apariencia,
  commit,
  agenda = false,
  kicker,
  aviso = null,
  children,
}: {
  branding: Branding;
  organizationName: string | null;
  userName: string;
  role: string;
  apariencia: Apariencia;
  /** Commit resuelto en el servidor, con su procedencia (ver `resolveCommit`). */
  commit?: ResolvedCommit;
  /** 015 — ¿esta instancia tiene agenda? Lo decide el servidor. */
  agenda?: boolean;
  /** 028 — La etiqueta bajo el logo (`navKicker`). */
  kicker?: string;
  /**
   * Franja de aviso por encima de TODA la aplicación (#85).
   *
   * Va aquí y no dentro de una pantalla porque lo que anuncia no es de una
   * pantalla: es que el agente no puede contestar. Quien tiene ese problema
   * no está mirando Ajustes, está mirando su bandeja y preguntándose por qué
   * no responde nadie.
   */
  aviso?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const esBandeja = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const [navOpen, setNavOpen] = useState(false);
  const [fecha, setFecha] = useState("");

  useEffect(() => {
    setFecha(new Intl.DateTimeFormat("es", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(new Date()));
  }, []);

  // Navegar = cerrar el cajón. Sin esto, tocar "Pipeline" deja el velo encima
  // de la pantalla recién cargada.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="app-escala flex overflow-hidden bg-background">
      {navOpen && (
        <button
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-overlay lg:hidden"
        />
      )}

      <AppNav
        branding={branding}
        organizationName={organizationName}
        commit={commit}
        userName={userName}
        role={role}
        apariencia={apariencia}
        agenda={agenda}
        kicker={kicker}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex min-h-14 shrink-0 items-center gap-3 border-b bg-background px-3 text-foreground lg:px-5">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Abrir el menú"
            aria-expanded={navOpen}
            className="rounded-md p-2 text-text-2 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <span className="min-w-0 truncate font-display text-xl font-[900]">
            {navTitle(pathname, { agenda, role })}
          </span>
          <span className="ml-auto hidden text-sm capitalize text-text-2 sm:block">{fecha}</span>
        </header>

        {aviso}
        {/* 056 — El tiempo real caído se ve desde cualquier pantalla. */}
        <BandaSinConexion />
        {/* 055 — Ctrl+K y «?» desde cualquier pantalla. */}
        <AtajosGlobales agenda={agenda} role={role} />

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden bg-background",
            esBandeja && "lg:bg-transparent"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
