# Pipeline comercial: prueba E2E

`scripts/e2e-pipeline-comercial.mjs` conduce Playwright contra una aplicación
local de pruebas y una base **vacía y desechable**. Crea usuario, contacto,
embudo, etapas, tratos y actividad; comprueba recarga, movimiento por formulario
y arrastre con ratón, teclado y gestos táctiles emulados, persistencia tras
recarga, cancelación por Escape y rechazo de una etapa de otro embudo en el
servidor, totales por moneda, convivencia con leads, rechazo
de duplicados y de borrado de etapas usadas, errores de red y aislamiento
entre organizaciones. Los gestos táctiles usan Chrome emulado, no un teléfono
físico. No prueba `/api/bot/*` de punta a punta.

También verifica campos de tratos: administración por rol, valores aislados por
trato, errores, archivos privados, sustitución y retirada, y permisos entre
organizaciones. La lectura `GET /api/crm/deal-fields/{id}/values` exige
`entidadId`; sin ese parámetro responde 422.

Para una instalación de pruebas ya iniciada, establecer
`WACHATO_TEST_BASE_URL`, `WACHATO_TEST_DB_APP` (local y cuyo nombre comience
por `wachato_test_`), `WACHATO_TEST_ALLOW_WRITE=base-vacia` y opcionalmente
`WACHATO_TEST_CHROME` con la ruta del ejecutable de Chrome; ejecutar:

```powershell
node scripts\e2e-pipeline-comercial.mjs
```

La app debe usar **esa misma base vacía**, con migraciones y mocks, y no
tener datos que deban conservarse. La prueba modifica su base y crea cuentas.

En Windows también puede iniciarse un entorno aislado con los binarios de
PostgreSQL de `@embedded-postgres/windows-x64` ya instalados:

```powershell
$env:WACHATO_TEST_EMBEDDED_ROOT = 'C:\ruta\que\contiene\node_modules'
$env:WACHATO_TEST_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts\e2e-pipeline-aislado.mjs
```

Para la regresión de campos de contactos y empresas en otra base aislada:
`node scripts\e2e-pipeline-aislado.mjs --campos`.

El lanzador crea su propia base, puerto y proyecto de Next dentro de un
directorio aislado, aplica migraciones y borra únicamente ese directorio al
finalizar. No modifica el arnés compartido ni usa la carpeta `.next` principal;
no ejecuta `next build`.
