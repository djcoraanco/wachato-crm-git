# Fase 2 — Core CRM universal

**Estado:** completado. [Spec, plan y tareas](../../specs/064-core-crm-universal/spec.md).

## Tarea 2.1 — Empresas y contactos

**Estado:** completada para el alcance de modelo y migraciones; la API y las
interfaces correspondientes siguen pendientes en la tarea 2.4.

- `contact_profile` separa atributos personales opcionales de la identidad de
  canal que ya utiliza el bot. `company` admite matriz; `company_contact`
  relaciona contactos y empresas.
- Las referencias compuestas impiden relaciones entre organizaciones; el
  borrado de un vínculo no borra el contacto ni la otra empresa. La API valida
  los ciclos de matrices y el acceso al avatar por organización.
- Migraciones generadas `0026_normal_night_thrasher.sql` (índice único previo)
  y `0027_perpetual_leech.sql` (tablas y restricciones). Se separaron porque
  Drizzle generó inicialmente las claves foráneas antes del índice requerido.
- `scripts/e2e-empresas-migracion.mjs` verificó con PostgreSQL 16 aislado una
  instalación nueva, actualización con contactos previos, reejecución,
  relaciones múltiples, cruces entre organizaciones, duplicados y cascadas.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (123 archivos y 1397 pruebas) y
  `pnpm build` pasaron.

## Tarea 2.2 — Campos personalizados

**Estado:** modelo y API de contactos y empresas completados; la interfaz se
integra en 2.4 y los valores de tratos se incorporan junto con su modelo en 2.3.

- Migraciones generadas `0028_gorgeous_vengeance.sql` a
  `0033_purple_frank_castle.sql`: definiciones, valores JSONB con índices GIN,
  permisos por campo y metadatos de archivos privados. Las referencias a
  contactos, empresas y definiciones están acotadas por organización.
- Validación Zod de los nueve tipos y endpoints iniciales de creación, lectura,
  escritura y carga/descarga privada. El responsable decidió privacidad por
  defecto y acceso compartible por campo con el equipo. Las definiciones se
  pueden editar o borrar si no se invalidan ni pierden datos; los archivos
  vinculados no se pueden borrar hasta retirar sus valores.
- El borrado de archivos marca el registro `eliminando`, confirma el borrado
  en los almacenes configurados y conserva el registro si falla para permitir
  un reintento. Los archivos en ese estado no se pueden descargar ni vincular.
- Antes de escribir el archivo se registra una carga pendiente; si falla, el
  registro queda visible para retirarlo. Se comprobó con un error real de
  escritura y con un registro pendiente que no puede descargarse ni vincularse.
- Una guarda impide borrar la organización mientras haya archivos nuevos; la
  ruta de Better Auth también verifica los archivos anteriores. Hay que borrar
  los archivos primero. Una huella sin credenciales identifica el disco y
  bucket originales; un cambio de almacén bloquea el borrado hasta restaurarlos.
  Los registros antiguos sin huella requieren confirmación explícita de un
  administrador de que los almacenes originales están conectados.
- PostgreSQL 16 temporal: instalación nueva, actualización con datos,
  reejecución y rechazos entre organizaciones aprobados. Prueba API real:
  creación, validación, persistencia, archivo y autenticación aprobados.
- Pruebas API adicionales: listar, revocar acceso y borrar valores y archivos;
  se rechazan borrados de archivos o campos en uso.
- Se comprobó el rechazo de eliminación de organización tanto por la API como
  por la restricción de PostgreSQL, y el rechazo con almacenamiento cambiado.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (124 archivos, 1404 pruebas) y
  `pnpm build` pasaron con la migración `0033` y el avance actual.

## Tarea 2.3 — Embudos, tratos y actividades

**Estado:** completado. Hay API, integridad transaccional e interfaz comercial;
la regresión integral está registrada al final de esta bitácora.

- Las migraciones aditivas `0034_material_arachne.sql` y
  `0035_sudden_maria_hill.sql` crean los índices y el modelo inicial para
  embudos adicionales, etapas, tratos, su historial y actividades. El
  tablero y los leads existentes siguen sin duplicación ni migración.
- En PostgreSQL aislado se comprobó la actualización, instalación limpia y
  rechazo de referencias cruzadas entre negocios y embudos, así como tratos
  con etapas o importes inconsistentes y actividades sin vínculo.
- Las migraciones `0036` y `0037` agregan campos personalizados y archivos de
  tratos. La API administra embudos, etapas, tratos y actividades, además de
  definiciones y valores de tratos.
- El borrado de una etapa principal, la comprobación de tratos y la
  reubicación de leads son transaccionales. Una prueba PostgreSQL comprobó que
  la inserción concurrente de un trato impide borrar o reubicar parcialmente.
- La migración `0038` agrega la configuración opcional de eventos de Meta por
  etapa. El dueño eligió usar exclusivamente el catálogo oficial de
  `business_messaging`: Meta no admite `Contact`, `Schedule` ni
  `SubmitApplication` para esta fuente. La emisión conserva la deduplicación
  por conversación y evento y no sustituye los eventos existentes del core.
- Se probó el catálogo y su rechazo de eventos inválidos, configuración
  desactivada, cambio de etapa y omisión sin identificador de anuncio, con
  PostgreSQL aislado. Con Meta simulado se verificó un envío con acuse y que
  un evento descartado queda como fallido sin impedir crear el trato. Chromium
  comprobó el selector del embudo principal y su persistencia. Los nueve tipos
  de campo de trato se probaron por API, con valores inválidos y privacidad;
  el borrado de un contacto con datos comerciales responde 409 y conserva el
  contacto.
- La interfaz selecciona y crea embudos, administra tratos y actividades y
  separa los totales por moneda. PostgreSQL y Chromium verificaron persistencia,
  errores, permisos y movimiento de tratos por selector y arrastre con ratón,
  teclado y gesto táctil emulado. Falta la regresión integral y sus gates.

## Tarea 2.4 — Contactos y kanban

**Estado:** completado. Contactos, empresas y Pipeline cuentan con vistas,
operaciones persistentes, exportaciones y pruebas aisladas de navegador/API.

- El avatar privado del contacto se carga y elimina desde su perfil y se ve
  en la lista. Admite JPEG, PNG y WebP estáticos de hasta 5 MB y 16 megapíxeles;
  se decodifica y normaliza a PNG sin metadatos. Para reemplazarlo se retira
  primero el anterior. Los contactos previos conservan sus iniciales.
- `0041_milky_blue_marvel.sql` agrega metadatos tenant-scoped con restricciones
  de borrado; una carga o eliminación fallida conserva su registro para
  reintento. El contacto y la organización no se borran con un avatar pendiente;
  si cambia la ubicación del almacenamiento, hay que restaurarla antes de
  retirarlo. La imagen se entrega solo a usuarios autenticados de la organización.
- `scripts/e2e-avatar-contacto.mjs`, en una copia de la app con PostgreSQL 16
  aislado y Chromium móvil, comprobó carga, visualización, eliminación,
  contactos distintos, acceso anónimo y de otra organización, entradas
  inválidas y fallos reales de escritura y borrado con reintento.
- La API y la vista de empresas crean, editan y vinculan contactos; admiten
  matriz y dirección. El cambio de matriz se serializa por organización y
  rechaza ciclos, también ante dos cambios simultáneos. El borrado no elimina
  en cascada sucursales, vínculos ni valores personalizados.
- PostgreSQL y Chromium móvil verificaron creación, persistencia, vinculación,
  desvinculación, eliminación de empresa vacía, rechazo de ciclos e
  aislamiento.
- El perfil adicional de contacto tiene API y formulario para datos personales,
  teléfonos, correos, dirección, canal preferido y registro de consentimiento.
  Valida fechas y teléfonos; los consentimientos se combinan sin sobrescribir
  las demás claves. Chromium
  móvil verificó persistencia y errores de validación.
- Las descargas XLSX y PDF horizontal aplican los filtros del servidor y no
  se cortan en los primeros 200 contactos. El Excel neutraliza fórmulas; el
  PDF informa si algún carácter no está disponible en su fuente y permite
  descargar Excel en su lugar. No se exportan notas ni campos privados.
- La lista permite cargar páginas adicionales y filtrar por canal y etiqueta.
  Las etiquetas se editan por contacto, se pueden buscar sin acentos y viajan
  en ambas exportaciones. La migración aditiva `0039` conserva los contactos
  anteriores con su lista vacía. Se verificaron aislamiento, límites,
  duplicados, búsqueda, filtrado y descarga desde Chromium móvil.
- La prueba con PostgreSQL aislado y Chromium móvil descargó y abrió ambos
  formatos con 205 contactos, además de verificar paginación, archivados,
  filtro de canal y etapa, aislamiento, fórmulas, caracteres no soportados,
  búsqueda por identidad y errores de conexión. El trazado de Next incluye la
  fuente y los recursos de PDFKit; no se pudo construir la imagen Docker en
  este equipo porque no está disponible Docker.
- Se corrigió el trazado standalone de `generator-function/require.mjs`,
  ausente en la imagen y requerido por Node 22. El build comprueba su inclusión
  cuando esta dependencia está presente. Si el servidor devuelve HTML en un
  error de exportación, la interfaz muestra el código HTTP en lugar de tratarlo
  como JSON.
- La interfaz de Contactos permite a dueños y administradores crear y editar
  definiciones por entidad, incluyendo tipo, opciones y visibilidad privada o
  compartida; la gestión de campos no aparece a miembros. En el perfil y la
  ficha de empresa se pueden consultar y guardar los nueve tipos existentes,
  adjuntar archivos privados y quitar valores. El servidor filtra definiciones
  por entidad y los valores por el registro seleccionado antes de responder;
  la interfaz nunca descarga valores de otros contactos o empresas.
- Chromium en una copia aislada de la app y PostgreSQL comprobó creación de
  definiciones desde Contactos y Empresas, privacidad por defecto, persistencia
  de valores en el perfil y empresa, borrado del valor que bloqueaba eliminar
  la empresa, además de la suite de validación y permisos de campos. La prueba
  de archivo confirmó carga, vinculación y descarga con contenido íntegro y
  rechazo sin sesión; también simuló fallos de almacén y vinculación, y el
  reintento del mismo archivo. El timeout anterior era de la espera de respuesta
  de la descarga de Chromium, no de la carga: ahora se verifica el evento de
  descarga y sus bytes.
- El pipeline existente informa fallos de guardado y vuelve a leer sus datos;
  no adelanta el movimiento o monto como si hubiera sido aceptado. Chromium
  verificó un fallo de conexión sin alterar el monto.

## Cierre de Fase 2 — Regresión integral

- `scripts/e2e-empresas-migracion.mjs` aprobó instalación nueva, actualización
  desde una base previa con datos, reejecución y aislamiento entre negocios.
- `scripts/e2e-selftest.mjs` aprobó **295/295 comprobaciones** en la aplicación
  real con PostgreSQL aislado y mocks, incluidos contratos del bot, ingesta,
  adjuntos, agenda, atribución, CAPI y caminos de error. Los guardarraíles del
  sandbox también se cubren con pruebas unitarias.
- Las pruebas aisladas de Pipeline comercial, campos de trato, avatar,
  contactos/exportación y filtros de Bandeja comprobaron persistencia,
  permisos, aislamiento y flujos móviles.
- Gates finales: `pnpm typecheck`, `pnpm lint`, `pnpm test` (**132 archivos,
  1431 pruebas**) y `pnpm build` con trazado de exportaciones; todos aprobados.
- No se construyó la imagen Docker: Docker no está disponible en este equipo.
