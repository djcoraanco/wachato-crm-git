# Fase 0 — Auditoría de arquitectura y prototipo

**Fecha:** 2026-11-17  
**Base revisada:** checkout local de Vocero CRM, paquete `vocero-crm` 2.5.0  
**Alcance:** inspección de la aplicación actual y lectura completa de `specs/design/wachato-prototype.html`. No se modificó código de producto ni se generaron migraciones.

## 1. Resumen ejecutivo

Vocero ya aporta una base funcional para varias superficies centrales del prototipo: Bandeja omnicanal, Pipeline de leads, Contactos, citas, configuración del agente externo, Laboratorio, Resultados, Ajustes de canales y tiempo real por SSE. También dispone de autenticación con organizaciones, aislamiento de consultas por organización, cifrado AES-256-GCM, recepción oficial de webhooks Meta y un contrato público `/api/bot/*`.

El prototipo Wachato es una demostración autocontenida en HTML/CSS/JavaScript, no una implementación funcional conectada a esta aplicación. Sus datos son locales y varias acciones están expresamente simuladas: respuestas de IA por palabras clave, ejecución de automatizaciones, conexión de webhook, lectura de documentos/URL, eventos CAPI y citas de ejemplo. Sus tokens y composición visual tampoco son los del CRM actual.

Por tanto, el trabajo futuro no es iniciar desde cero ni copiar el prototipo literalmente. Es adaptar de forma incremental las superficies ya funcionales, preservar contratos y guardarraíles actuales y construir las capacidades nuevas mediante cambios aditivos y verificables.

## 2. Arquitectura actual verificada

| Área | Estado actual |
|---|---|
| Aplicación | Next.js 15 App Router, React 19 y TypeScript estricto; pnpm, PostgreSQL y Drizzle. Rutas autenticadas bajo `src/app/(app)/`, API bajo `src/app/api/` y lógica de dominio en `src/server/`. |
| Persistencia | `src/lib/db/schema.ts` declara 36 tablas, incluidas organización/miembros, contactos, etapas y leads, conversaciones/mensajes, credenciales, perfil/conocimiento del agente, citas, atribución/CAPI, despacho, eventos de webhook, respuestas rápidas y notas internas. Hay migraciones versionadas desde `0000` hasta `0025`. |
| Tenant y auth | Better Auth con plugin de organizaciones. `scoped()` exige organización explícita en consultas de dominio; los roles actuales se resuelven desde la membresía. |
| Canales | WhatsApp Cloud API oficial y adaptadores opcionales para Instagram, Messenger y TikTok, protegidos por `CHANNELS`. El cliente de Meta está centralizado. |
| Agente | Desde 2.0, el CRM no ejecuta el turno conversacional: despacha al cerebro externo y ofrece `/api/bot/*` como contrato de servicio. El perfil expone herramientas según el rol configurado, no según módulos sectoriales instalados. El proveedor LLM del CRM se usa para el proxy y el juez del Laboratorio. |
| Eventos y tareas de fondo | SSE alimenta la UI. Los webhooks entrantes y el outbox de despacho se persisten en PostgreSQL con leases/reintentos; sus workers se ejecutan dentro del proceso y usan temporizadores para barrer/despertar. No existe hoy un motor genérico de automatizaciones persistentes ni `automation_jobs`. |
| Seguridad | Secretos cifrados en reposo con AES-256-GCM. El webhook de WhatsApp valida el token de ruta y verifica firma HMAC del cuerpo crudo cuando está configurado `META_APP_SECRET`. Las conversaciones de prueba tienen guardarraíl de envío. |
| Validación y pruebas | Zod en límites externos y Vitest unitario. Hay 122 archivos de pruebas unitarias; los E2E se conducen con scripts contra una app viva. |

## 3. Prototipo Wachato: tokens, layout y flujos

La fuente visual inspeccionada es `specs/design/wachato-prototype.html`. Contiene:

- **Tema oscuro inicial y tema claro:** fondo `#0D1920` / `#EEF4F5`; paneles `#13222B`, `#1A2E39` / `#FFFFFF`, `#F3F8F9`; línea `#243C4A` / `#D3E1E5`; acento turquesa `#00C4C0` y variante clara `#009C98`.
- **Tipografía:** Nunito 800/900 para marca, títulos y métricas; Plus Jakarta Sans para texto. El HTML las carga desde Google Fonts.
- **Identidad por canal y chat:** WhatsApp `#25D366`, Instagram `#EA4F86`, Messenger `#5B97F7`; burbujas inbound `#1E3542`, equipo `#0B514E` e IA `#173F4A`.
- **Shell:** sidebar de 228 px con marca, navegación y tarjeta del negocio; topbar con título, estado prototipo y fecha; zona de trabajo con scroll y variante flush para Bandeja. En móvil, navegación horizontal y Bandeja de una vista a la vez.
- **Vistas:** Bandeja de tres columnas; Pipeline kanban; tabla de Contactos; Automatizaciones; Agentes; Entrenar IA; Calendario; Estadísticas; Conexiones y Meta.
- **Comportamiento demostrativo:** el HTML mantiene contactos, agenda, automatizaciones y configuración en arrays JavaScript locales. La respuesta del “agente” es por reglas de palabras clave; `setTimeout` simula escritura, lectura y respuesta; las conexiones, CAPI, agenda, carga/lectura de conocimiento y ejecuciones no persisten ni llaman a los servicios productivos.

## 4. Correspondencia entre prototipo y aplicación

| Vista/flujo Wachato | Correspondencia actual | Diferencia principal / trabajo pendiente |
|---|---|---|
| Shell, navegación, marca y temas | `src/components/app-shell.tsx`, `src/components/app-nav.tsx`, `src/lib/nav.ts`, `src/app/globals.css`, `tailwind.config.ts` y `src/app/layout.tsx`. Shell responsivo, navegación calculada en servidor por rol/banderas, white-label, tema claro/oscuro y fuentes self-hosted. | La identidad visual actual es Vocero (acento base azul, Urbanist/Archivo/Inter/IBM Plex), no la paleta Wachato, Nunito/Plus Jakarta Sans ni el sidebar ancho del prototipo. El shell desktop actual es un riel de iconos; no hay topbar común con título y fecha como en la referencia. |
| Bandeja | `/inbox` y `src/components/inbox/`; SSE, canales activos, filtros/lectura, mensajes, notas, envío de medios, citas rápidas y control de IA/handoff. | El prototipo incluye un panel lateral más amplio con datos del negocio, simulador de cliente/equipo y monitor específico de ventana/plantillas. Hay que cotejar capacidades existentes antes de duplicarlas; cualquier “simulación” debe seguir aislada del envío real y del sandbox. |
| Pipeline | `/pipeline`, `src/components/pipeline/` y API `src/app/api/pipeline/`; etapas y leads persistidos, movimiento y registro de historial. CAPI tiene su módulo y bandera. | Modelo actual es un pipeline de etapas y lead por contacto, no múltiples pipelines/deals. No está demostrado que la configuración por etapa del prototipo (evento Meta y agregados económicos) corresponda exactamente a la UI existente. |
| Contactos | `/contacts`, `src/components/contacts/`; búsqueda e importación, contactos omnicanal, fuente, etiquetas y ficha. | No se encontró en la base inspeccionada el exportador XLSX/PDF del demo ni empresas/cuentas, datos personales extendidos, consentimiento granular, campos personalizados ni relaciones N:M. Verificar límites de privacidad antes de añadir identificadores sensibles. |
| Automatizaciones | No hay pantalla/entidad general equivalente en el mapa actual. Existen outbox de despacho y cola persistida de eventos de webhook, que son infraestructura específica, no un editor de automatizaciones. | Vista, definición de flujos, historial de ejecuciones y motor general son nuevos. La restricción del objetivo excluye temporizadores volátiles para tareas diferidas; se debe diseñar cola PostgreSQL y concurrencia antes de implementar. |
| Agente y proveedor | `/agent`, `/settings/ai`, `src/server/bot/profile.ts`, `src/server/ai/` y `/api/bot/*`. Credenciales cifradas, perfil, conocimiento, roles/herramientas y despacho externo. | No existe modo “Agente Wachato” conversacional local ni modo mixto de fallback 10 s; el contrato actual da prioridad a un cerebro externo y no se debe romper. La lista multi-proveedor del prototipo no equivale por sí sola a adaptadores productivos. |
| Entrenar IA | `/lab`, `/agent`, `src/server/lab/` y API de conocimiento (`/api/kb`). | No es una vista unificada con cinco bloques, medidor y sandbox sticky tal como el prototipo. La ejecución actual se apoya en el cerebro conectado; no se debe reintroducir una IA autónoma en el proceso. |
| Calendario | `/bookings`, `src/components/bookings/`, `/api/bookings` y `/api/calendar/*`, detrás de `AGENDA`; conectores de enlace, Zoom y Google. | Hay calendario de citas funcional y configurable, pero debe validarse visualmente contra la rejilla semanal y la distinción IA/equipo del prototipo. No debe convertirse en una dependencia obligatoria del Core. |
| Estadísticas | `/results`, `src/components/results/`, `/api/analytics/*`; ventas, agente, anuncios e higiene, con exclusión del Laboratorio. | Cobertura analítica existente es sustancial, pero la composición de KPI, gráfico apilado, embudo y tabla de atribución debe alinearse con el diseño y los datos reales; no copiar cifras de ejemplo. |
| Conexiones y Meta | Ajustes de WhatsApp, canales opcionales, plantillas, calendario y, con `ATRIBUCION`, anuncios/CAPI. Estado de canales en `/settings/channels`. | No hay una sola pantalla que reúna la lista completa, checklist de revisión Meta y log CAPI ilustrado. Los estados de cumplimiento y logs del HTML son ficticios; no deben presentarse como verificados. |
| Voz | Ingesta y persistencia de medios de WhatsApp; `src/server/whatsapp/nota-de-voz.ts` adapta audio saliente a formatos aceptados. | No se encontró transcripción entrante Whisper/Groq ni el texto transcrito solicitado. |
| Módulos sectoriales | Canales y agenda son módulos opcionales de despliegue por bandera, con superficie 404 apagada por defecto. | No hay catálogo nativo por negocio, `module_installations`, carpetas `modules/{module_id}` ni ocho módulos sectoriales. Las banderas de despliegue actuales no son el instalador dinámico persistido que pide el objetivo. |

### Nota sobre rutas

El prototipo enumera rutas de referencia como `src/app/(dashboard)/...`; el repositorio real usa el grupo autenticado `src/app/(app)/...`. Las rutas públicas `/api/bot/*` son un contrato existente y deben conservar forma, códigos y comportamiento. La nomenclatura del prototipo no justifica mover las rutas actuales.

## 5. Restricciones, riesgos y decisiones para fases futuras

1. **Constitución y soberanía:** proveedores de pagos, almacenamiento externo, correo, mensajería de operador y otros terceros no pueden entrar como dependencias obligatorias del Core. Integraciones sectoriales deben seguir el patrón de conector opcional aprobado y apagado por defecto.
2. **Cola persistente:** los workers actuales procesan colas específicas persistidas, pero se despiertan con temporizadores in-process. La cola genérica de automatizaciones requiere un diseño propio de estados, lease, `SKIP LOCKED`, reintentos, idempotencia, límites y arranque; no sustituir el outbox/webhook sin necesidad.
3. **Compatibilidad pública:** preservar `/api/bot/*`, despacho firmado y eventos SSE. Nuevas herramientas dinámicas deben añadirse de forma aditiva, con compatibilidad para cerebros existentes y pruebas del contrato.
4. **Datos personales y clínicos:** el esquema actual no implementa expedientes médicos desacoplados ni los cinco roles del objetivo. Debe definirse autorización de servidor y minimización de datos antes de crear tablas, y mantener fuera del contexto del bot la información clínica protegida.
5. **Activación dinámica vs. despliegue:** el código de módulos debe quedar compilado en el build; la activación persistida solo puede controlar acceso, menú, endpoints y herramientas. Los paquetes importables deben ser declarativos y validados, nunca ejecutables.
6. **Migraciones:** el esquema ha avanzado por 25 migraciones. Las nuevas tablas/campos deben ser aditivos, generados con Drizzle y revisados; no editar migraciones aplicadas ni alterar tablas/contratos existentes retroactivamente.
7. **Prototipo no es criterio de backend:** sus datos, permisos, respuestas de IA, estados Meta y botones no son fuentes confiables. Cada flujo que se implemente debe usar APIs/DB reales y tener tests; los estados no disponibles deben expresarse honestamente.
8. **Diseño:** el cambio de marca/tokens afecta toda la aplicación y sus temas, accesibilidad, white-label y pruebas de contraste. La Tarea 1.1 debe traducir tokens sin eliminar personalización de organización ni degradar el tema actual antes de tener una migración visual revisable.

## 6. Línea base

Ejecutado desde la raíz del checkout el **2026-11-17**:

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | Código 0; sin errores de TypeScript. |
| `pnpm test` | Código 0; 122 archivos y 1389 pruebas aprobadas. Vite emitió warnings, sin fallos. |

La auditoría y el plan maestro son documentación de control. No se ejecutó `pnpm lint`, `pnpm build`, E2E ni migración porque la Fase 0 solo prescribe typecheck y test.

## 7. Próximo paso

Fase 0 completada. Esperar confirmación explícita antes de iniciar **Fase 1, Tarea 1.1 (tokens, tipografías y tema Wachato)**. La siguiente tarea no debe comenzar automáticamente como parte de esta auditoría.
