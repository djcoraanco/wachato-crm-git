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

## Tarea 1.2 — App Shell responsivo

**Estado:** completada con autorización.  
**Spec ligero:** [063 — Shell Wachato](../../specs/063-shell-wachato/spec.md),
escrito después de la implementación y marcado como tal.

- Lateral de 228 px en escritorio y cajón móvil; conserva navegación por rol y
  banderas, contador real, marca, avisos, tema, instalación y cierre de sesión.
- Cabecera con vista y fecha local; tarjeta con el nombre real de la
  organización. La marca predeterminada es Wachato, sin alterar las marcas
  personalizadas ni fabricar estados de producción.
- Sin cambios de esquema, migraciones ni contratos públicos.
- Archivos: `src/components/app-shell.tsx`, `src/components/app-nav.tsx`,
  `src/app/(app)/layout.tsx`, `src/lib/nav.ts`, `src/server/branding.ts`,
  `src/lib/branding.ts`, `src/components/brand-mark.tsx`,
  `src/components/settings/branding-client.tsx`, `tests/unit/branding.test.ts`,
  `tests/unit/brand-mark.test.ts`, `tests/unit/favicon.test.ts`,
  `tests/unit/nav.test.ts`, `tests/unit/version.test.ts`,
  `tests/e2e/us-diseno-tarjetas.md` y `scripts/e2e-diseno-061.mjs`.

| Comando o prueba | Resultado |
|---|---|
| `pnpm typecheck` · `pnpm lint` · `pnpm build` | Correctos. |
| `pnpm test` | Correcto, 123 archivos y 1397 pruebas. |
| `scripts/e2e-diseno-061.mjs` | 38/38; app local real con PostgreSQL 16 temporal y mocks, escritorio y móvil. Marca Wachato y logo personalizado comprobados también en navegador. |
| Cascarón en navegador con dependencias simuladas | Navegación, roles, contador, agenda, contraste claro/oscuro, error de red y cierre del menú correctos. |

La app de producción no fue modificada ni se publicó un commit desde esta
sesión. Para ejecutar el E2E se puede indicar el navegador del sistema con
`E2E_BROWSER_PATH`; los datos de prueba se mantuvieron aislados.

## Tarea 1.3 — Gates de Fase 1

**Estado:** completada. Se ejecutaron secuencialmente `pnpm typecheck`,
`pnpm lint`, `pnpm test` (123 archivos, 1397 pruebas) y `pnpm build`;
todos pasaron. Continúan los avisos conocidos de Vite sobre imports dinámicos
sin extensión.

## Siguiente fase

**Fase 2 — Core CRM Universal y modelo extendido.** Autorizada.
