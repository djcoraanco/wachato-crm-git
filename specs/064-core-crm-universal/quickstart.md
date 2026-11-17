# Verificación local

1. Usar una base PostgreSQL aislada con datos ficticios; no usar producción.
2. Aplicar migraciones en una base vacía y en otra con datos anteriores.
3. Correr `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build`.
4. Con mocks habilitados, ejercitar las funciones implementadas desde el
   navegador, incluidos aislamiento, validación y errores de persistencia.
5. Para exportaciones, abrir y comprobar los archivos y los filtros reales.
