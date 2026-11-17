# Tareas: CRM universal

Cada subtarea del plan maestro se termina y verifica antes de avanzar. Las
tareas pendientes de diseño se detallan antes de escribir su implementación.

## Preparación

- [X] T001 Registrar la especificación y el plan en `specs/064-core-crm-universal/`.

## 2.1 — Empresas y contactos

- [X] T002 [US1] Definir perfil opcional, empresa y vínculos tenant-scoped en `src/lib/db/schema.ts`.
- [X] T003 [US1] Generar y revisar migración aditiva en `drizzle/`.
- [X] T004 [US1] Comprobar migración nueva y actualización con datos, restricciones y aislamiento en `scripts/e2e-empresas-migracion.mjs`.
- [X] T005 [US1] Pasar gates y registrar evidencia en `docs/implementation/02-core-crm.md`.

## 2.2 — Campos personalizados

- [X] T006 [US2] Precisar modelo, límites, archivos y reglas en `specs/064-core-crm-universal/data-model.md`.
- [X] T007 [US2] Implementar esquema, validación, almacenamiento privado y API para contactos y empresas en `src/lib/`, `src/server/` y `src/app/api/`.
- [X] T008 [US2] Verificar tipos, aislamiento, archivos y errores en `tests/` y registrar gates en `docs/implementation/02-core-crm.md`.

## 2.3 — Embudos, tratos y actividades

- [ ] T009 [US3] Precisar modelo, transiciones y compatibilidad en `specs/064-core-crm-universal/data-model.md`.
- [X] T009a [US3] Crear índices compuestos previos para referencias al lead y a etapas existentes en `src/lib/db/schema.ts` y `drizzle/`.
- [X] T009b [US3] Definir tablas, restricciones e historial de embudos, tratos y actividades, además de campos de trato en `src/lib/db/schema.ts` y `drizzle/`.
- [X] T009c [US3] Probar actualización y referencias cruzadas entre organización, embudo y etapa en `scripts/e2e-empresas-migracion.mjs`.
- [X] T009d [US3] Serializar la eliminación de etapas existentes y la creación o movimiento de tratos para evitar reubicaciones parciales en `src/app/api/pipeline/stages/[id]/route.ts` y `src/server/leads/stage-history.ts`.
- [ ] T010 [US3] Implementar migraciones, dominio y valores personalizados de tratos en `src/lib/db/schema.ts`, `drizzle/` y `src/server/`.
- [ ] T011 [US3] Implementar API y pruebas de integridad en `src/app/api/` y `tests/`.
- [ ] T012 [US3] Ejecutar gates y registrar evidencia en `docs/implementation/02-core-crm.md`.

## 2.4 — Contactos y kanban

- [ ] T013 [US4] Implementar vistas y operaciones reales en `src/components/contacts/` y `src/components/pipeline/`.
- [ ] T014 [US4] Implementar exportaciones filtradas seguras XLSX/PDF en `src/server/` y `src/app/api/`.
- [ ] T015 [US4] Probar flujos y errores en `tests/` y `scripts/`, ejecutar gates y registrar evidencia en `docs/implementation/02-core-crm.md`.

## 2.5 — Regresión

- [ ] T016 Verificar actualización de base previa, aislamiento, contratos y E2E en `tests/` y `scripts/`.
- [ ] T017 Ejecutar gates y cerrar la fase en `docs/UNIVERSAL_CRM_MASTER_PLAN.md` y `docs/implementation/02-core-crm.md`.

**Dependencias:** T002–T005 antes de 2.2; 2.2 antes de 2.3; 2.3 antes de
2.4; 2.4 antes de 2.5, por la secuencia atómica solicitada.
