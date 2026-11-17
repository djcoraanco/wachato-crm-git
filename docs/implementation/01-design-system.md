# Fase 1 — Tarea 1.1: Design System Wachato

**Fecha:** 2026-11-17  
**Estado:** completada  
**Autorización:** confirmación del responsable tras cerrar la Fase 0.

## Alcance realizado

- Añadidos los temas Wachato oscuro y Wachato claro, conservando los IDs y estilos de los temas existentes.
- El fallback para instalaciones sin preferencia usa el tema Wachato oscuro y Plus Jakarta Sans; el selector conserva las opciones tipográficas previas.
- Configuradas Nunito 800/900 como display y Plus Jakarta Sans para interfaz mediante `next/font`, servidas localmente desde el build.
- Añadidos tokens Tailwind/CSS de canales, burbuja IA, acento suave y línea; headings, wordmark y KPI usan la fuente display.
- El acento predeterminado es turquesa Wachato, derivado para mantener contraste en claro y oscuro; la personalización por organización continúa activa.
- Ajustados tokens de contraste de Wachato para cumplir los pisos WCAG ya probados por el proyecto.

## Archivos tocados

- `src/lib/temas.ts`
- `src/lib/branding.ts`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `tailwind.config.ts`
- `src/components/brand-mark.tsx`
- `src/components/results/stat-card.tsx`
- `src/components/settings/apariencia-client.tsx`
- `tests/unit/temas.test.ts`
- `tests/unit/branding.test.ts`
- `tests/unit/contraste-temas.test.ts`
- `tests/unit/favicon.test.ts`
- `docs/UNIVERSAL_CRM_MASTER_PLAN.md`

## Persistencia y migraciones

Sin cambios de esquema, datos ni migraciones: las preferencias existentes siguen usando el formato y almacenamiento actuales.

## Verificación

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | Correcto, código 0. |
| `pnpm lint` | Correcto, código 0. |
| `pnpm test` | Correcto, 122 archivos y 1392 pruebas aprobadas. |
| `pnpm build` | Correcto en el segundo intento. El primero falló al procesar `IBM_Plex_Sans` en `next/font` (`TypeError`); no se reprodujo al repetir el build. |

Permanecen warnings de Vite sobre imports dinámicos sin extensión en `tests/unit/version.test.ts` y mensajes de error esperados en pruebas de red/juez; no impidieron los gates.

## Siguiente tarea

**1.2 — Adaptar el App Shell responsivo** (sidebar, topbar, navegación y layout). No iniciada.
