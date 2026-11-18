# Wachato CRM Universal — Plan maestro

**Base:** Vocero CRM 2.5.0  
**Última actualización:** 2026-11-17  
**Regla de ejecución:** una subtarea a la vez; actualizar su estado y bitácora; validar los gates indicados antes de avanzar. Las Fases 0 y 1 están cerradas; la Fase 2 fue autorizada.

## Estados

- `[ ] PENDIENTE`
- `[>] EN DESARROLLO`
- `[X] COMPLETADO`
- `[!] BLOQUEADO`

## Fase 0 — Auditoría inicial, línea base e inspección del prototipo

- [X] **0.1 Inspeccionar base y prototipo.** Revisar `src/`, `drizzle/` y leer `specs/design/wachato-prototype.html`.
- [X] **0.2 Documentar auditoría.** Crear `docs/implementation/00-auditoria.md` con estado actual, mapa visual, brechas y riesgos.
- [X] **0.3 Inicializar plan maestro.** Mantener este checklist con estados por subtarea.
- [X] **0.4 Ejecutar línea base.** `pnpm typecheck` y `pnpm test`; ambos limpios (122 archivos, 1389 pruebas).

**Bitácora:** [docs/implementation/00-auditoria.md](./implementation/00-auditoria.md)

## Fase 1 — Design System Wachato y App Shell

- [X] **1.1** Configurar tokens de diseño, tipografías y variables CSS según el prototipo, manteniendo accesibilidad, temas y white-label.
- [X] **1.2** Adaptar App Shell responsivo (sidebar, topbar, navegación y layout).
- [X] **1.3** Ejecutar gates: `pnpm typecheck`, `pnpm test`; añadir lint/build cuando el alcance lo requiera.

## Fase 2 — Core CRM Universal y modelo extendido

- [X] **2.1** Diseñar e implementar migraciones aditivas para empresas y vínculos N:M empresa-contacto.
- [X] **2.2** Implementar definiciones/valores de campos personalizados con validación Zod y almacenamiento/indexación adecuados (contactos y empresas; tratos se integra en 2.3, interfaz en 2.4).
- [X] **2.3** Diseñar pipelines múltiples, tratos y tareas/actividades sin romper la semántica actual de leads y etapas.
- [X] **2.4** Implementar vistas de Contactos y Pipeline según el prototipo, con exportaciones XLSX/PDF seguras si se aprueban dependencias/formatos.
- [X] **2.5** Ejecutar gates y pruebas de regresión de tenant, API y migraciones.

## Fase 3 — Bandeja en tiempo real, medios vocales y conexiones

- [X] **3.1** Alinear Bandeja con el prototipo preservando contrato de mensajes, SSE, límites por canal, ventana y sandbox.
- [X] **3.2** Diseñar e implementar transcripción de notas de voz entrantes; proveedor externo opcional, datos minimizados y envío al cerebro con marcador explícito.
- [X] **3.3** Construir la vista de Conexiones/Meta usando estados reales de canales, plantillas y CAPI.
- [X] **3.4** Ejecutar gates, pruebas de contratos y flujos E2E afectados.

Avance verificado: Bandeja con filtro de atención manual y distribución
responsiva de lista, hilo y detalles; Conexiones muestra canales habilitados,
plantillas y actividad CAPI tenant-scoped sin inventar estados de Meta. La
transcripción opcional está apagada por defecto, cifra credenciales/caché y
degrada sin bloquear el despacho. Las pruebas aisladas de Chromium cubrieron
permisos, móvil, errores y banderas; el self-test integral aprobó **295/295**.
Gates finales: `pnpm typecheck`, `pnpm lint`, `pnpm test` (132 archivos, 1431
pruebas) y `pnpm build` con trazado de exportaciones, todos aprobados. Evidencia
detallada: [Fase 2](./implementation/02-core-crm.md) y
[Fase 3](./implementation/03-bandeja-y-regresion.md).

## Fase 4 — Motor modular nativo

- [ ] **4.1** Definir contrato compilado de módulos y persistencia tenant-scoped de instalaciones.
- [ ] **4.2** Implementar catálogo de módulos y activación/desactivación en Ajustes.
- [ ] **4.3** Aplicar activación a rutas, navegación y herramientas, siempre validada en servidor; registrar códigos inactivos según contrato.
- [ ] **4.4** Ejecutar gates para módulos apagados y encendidos, sin carga de código ejecutable en runtime.

## Fase 5 — Automatizaciones persistentes y Calendario

- [ ] **5.1** Diseñar `automation_jobs`, reclamo concurrente con `FOR UPDATE SKIP LOCKED`, leases, reintentos, deduplicación y protección contra bucles.
- [ ] **5.2** Implementar editor/lista de automatizaciones, ejecuciones persistidas y alertas de handoff.
- [ ] **5.3** Alinear Calendario semanal con citas y conectores opcionales existentes.
- [ ] **5.4** Ejecutar pruebas de concurrencia, idempotencia, reinicio y gates.

## Fase 6 — Plataforma de IA, entrenamiento y Sandbox

- [ ] **6.1** Implementar router de herramientas filtrado por módulos activos con contrato `/api/bot/profile` aditivo.
- [ ] **6.2** Implementar configuración de modos de atención y proveedores aprobados sin alterar el contrato existente del cerebro externo.
- [ ] **6.3** Adaptar entrenamiento y Sandbox a los cinco bloques del prototipo con datos persistentes y conocimiento real.
- [ ] **6.4** Ejecutar gates y tests para perfil, cifrado, permisos y sandbox.

## Fase 7 — Módulos sectoriales oficiales

- [ ] **7.1** Restaurantes: mesas, reservas, menú, comandas y tickets.
- [ ] **7.2** Clínicas: doctores, especialidades, citas administrativas y separación estricta de datos clínicos.
- [ ] **7.3** E-commerce/Retail: catálogo, variantes, inventario, carritos y seguimiento; pagos solo como conectores opcionales aprobados.
- [ ] **7.4** Marketing/Agencias: atribución, UTMs, proyectos y conectores salientes opcionales.
- [ ] **7.5** Inmobiliarias, Educación, Servicios Profesionales y Logística; especificar cada módulo antes de su implementación.
- [ ] **7.6** Ejecutar gates y pruebas de aislamiento, permisos, contrato y módulo apagado/encendido para cada módulo.

## Fase 8 — Seguridad, backups, telemetría y release

- [ ] **8.1** Diseñar RBAC granular y bitácora de auditoría inmutable; asegurar comprobación servidor-side.
- [ ] **8.2** Diseñar backups/restauración y exportación universal, con privilegios mínimos, integridad y cifrado opcional.
- [ ] **8.3** Alinear Estadísticas con KPI, canales, embudo y atribución usando solo métricas reales.
- [ ] **8.4** Implementar telemetría de agencia protegida y presets sectoriales sin exponer secretos ni datos sensibles.
- [ ] **8.5** Ejecutar build de producción, suite de tests y E2E; documentar release y compatibilidad.

## Gates de referencia

Antes de cerrar una fase, ejecutar los gates relevantes definidos por el repositorio:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Los cambios observables requieren pruebas de comportamiento y su camino infeliz. Cambios de esquema requieren migración Drizzle aditiva revisada. No se ejecutan tareas posteriores hasta que la tarea actual esté validada y anotada en su bitácora `docs/implementation/`.

**Bitácora de Fase 1:** [docs/implementation/01-design-system.md](./implementation/01-design-system.md)
