# Plan: CRM universal

**Rama:** `20261117-123900-core-crm-universal` · **Fecha:** 2026-11-17  
**Spec:** [spec.md](./spec.md)

## Resumen

Ampliar el CRM con empresas, atributos opcionales, campos, embudos, tratos y
actividades, más sus interfaces y exportación. Entregar por tareas 2.1–2.5;
cada una se valida antes de continuar.

## Contexto técnico

- Next.js 15, React 19, TypeScript estricto, Drizzle y PostgreSQL.
- Base existente: contactos con identidad estable por canal, una etapa de lead
  por contacto y bitácora centralizada de movimientos.
- El despliegue aplica migraciones versionadas al arrancar. La app y los mocks
  sirven para el E2E; Vitest, typecheck, lint y build son gates.
- Las exportaciones deben ser self-hosted, respetar filtros y neutralizar
  fórmulas. La elección de bibliotecas debe evaluarse antes de añadirlas.

## Revisión constitucional

- Tenant: todas las tablas nuevas tienen `organization_id` e índices org-first;
  referencias relacionadas se comprueban dentro de la organización.
- Seguridad: archivos privados con autenticación; datos nuevos fuera del bot,
  de logs y de la API de Meta. Los roles existentes siguen en vigor.
- Compatibilidad: migraciones aditivas; no se alteran los contratos del bot,
  despacho, webhooks ni SSE. El lead conserva su única puerta de movimiento.
- Soberanía: ningún servicio externo nuevo es requisito.
- Verificación: cada tarea tiene pruebas de éxito y rechazo; se comprueba la
  actualización de una base con datos además de una base nueva.

## Diseño y secuencia

1. **2.1** Añadir atributos opcionales separados del contacto existente,
   empresas y relaciones N:M. Generar y revisar migración Drizzle; verificar
   claves compuestas y aislamiento con Postgres.
2. **2.2** Añadir definiciones y valores tipados, índices JSONB y validación de
   opciones, propiedades y archivos. Diseñar el ciclo de archivos privados
   antes de exponerlos; no extender el contrato del bot.
3. **2.3** Integrar el tablero de leads existente como embudo predeterminado,
   manteniendo la escritura y la bitácora actuales; añadir otros embudos,
   tratos y actividades. Rechazar referencias entre embudos u organizaciones y
   mantener monedas separadas al sumar.
4. **2.4** Integrar empresas, campos y datos de contacto en la UI; tabla
   filtrable con exportación segura y tablero para embudos, sin sustituir el
   tablero legado ni sus funciones.
5. **2.5** Ejecutar gates, migración de instalación anterior, aislamiento,
   contratos y flujos reales de navegador, incluido camino infeliz.

Los detalles y decisiones por tarea se registrarán en
[data-model.md](./data-model.md), [tasks.md](./tasks.md) y la bitácora de fase.
No se declara completada una tarea solo por tener esquema o pruebas unitarias.

## Ubicación

Esquema y migraciones en `src/lib/db/schema.ts` y `drizzle/`; validación pura en
`src/lib/`, dominio en `src/server/`, rutas autenticadas en `src/app/api/`,
componentes en `src/components/`, pruebas en `tests/` y arneses en `scripts/`.
