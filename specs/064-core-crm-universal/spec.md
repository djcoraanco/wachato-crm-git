# Especificación: CRM universal

**Rama**: `20261117-123900-core-crm-universal`  
**Fecha**: 2026-11-17  
**Estado**: borrador previo a la implementación  
**Entrada**: completar la fase 2 del plan maestro preservando el CRM existente.

## Escenarios de usuario y pruebas

### 1. Directorio de empresas y contactos (P1)

Un miembro administra empresas y relaciona un contacto con varias empresas,
sin perder el directorio, las conversaciones ni el lead existentes.

1. Dada una empresa, al registrar razón social y datos de contacto válidos,
   aparece al volver a abrir el CRM.
2. Dadas dos empresas, un contacto puede vincularse a ambas; quitar un vínculo
   no borra el contacto ni la empresa.
3. Las sucursales pueden señalar su matriz de la misma organización, sin
   ciclos ni vínculos a empresas de otra organización.
4. Los atributos adicionales del contacto son opcionales; se conserva su
   identidad de canal y no se modifica la ficha que consume el agente.
5. Una solicitud de otra organización no puede leer ni modificar los registros
   o sus relaciones.

### 2. Campos configurables (P1)

El dueño define campos específicos de su negocio y el equipo guarda valores
validados sin alterar los campos ni la ficha existentes.

1. Se admiten texto, número, moneda, fecha, booleano, selección,
   multiselección, archivo y JSON, con nombre y opciones pertinentes.
2. Un valor inválido se rechaza con explicación; un valor válido persiste y
   aparece al recargar la entidad correspondiente.
3. Los archivos son privados y accesibles solo con sesión y organización
   autorizadas; datos y archivos de otra organización no son accesibles.
4. Los campos son privados para administradores por defecto y cada uno puede
   compartirse explícitamente con el equipo. No se incorporan automáticamente
   al contexto del bot.

### 3. Múltiples embudos, tratos y actividades (P1)

El equipo crea embudos y etapas, añade tratos y registra actividades. El
tablero de leads existente forma el embudo predeterminado, conservando su
historial y el comportamiento del bot.

1. Se crean al menos dos embudos con etapas independientes y se selecciona
   cualquiera para ver sus tratos.
2. Un trato se crea, edita y mueve dentro de su embudo; sus importes y moneda
   se conservan y los totales no mezclan monedas.
3. Una etapa o trato de otra organización o embudo no se acepta como destino.
4. Llamadas, reuniones, tareas y notas se pueden registrar en un contacto o
   trato y consultar posteriormente.
5. Los leads previos, su historial, estadísticas y desplazamiento por el bot
   mantienen su comportamiento y sus contratos.

### 4. Contactos y kanban (P2)

El equipo usa una tabla adaptable con búsqueda y filtros de etapa, canal y
etiqueta, y exporta los resultados a Excel o PDF horizontal. El tablero conserva
el arrastre y presenta totales reales por columna.

1. Buscar y filtrar devuelve únicamente contactos coincidentes, incluidos los
   que estén fuera de la primera página; no se muestran datos de otra
   organización.
2. Las exportaciones contienen los mismos resultados filtrados y no ejecutan
   fórmulas introducidas como datos. Son archivos válidos en sus formatos.
3. Una entrada con error de validación o una descarga fallida muestra el error
   y no aparenta haberse guardado o descargado.
4. El diseño es utilizable con teclado, en escritorio y en móvil.

### Casos límite

- Datos anteriores a la migración, contactos sin teléfono y contactos sin
  conversación.
- Vínculos duplicados, referencias de otra organización, matriz circular,
  fechas y monedas inválidas, selecciones ajenas y archivos demasiado grandes.
- Intento de borrar una entidad con relaciones o actividad: no se pierden
  datos silenciosamente.
- Filtros sin resultados, pérdida de conexión y exportación vacía.
- Cambio simultáneo de etapa o valor: no se muestra como guardado un cambio
  rechazado por el servidor.

## Requisitos

### Requisitos funcionales

- **RF-001**: el directorio admite empresas con razón social, identificación
  fiscal, teléfono, dirección y matriz opcionales; empresa y contacto admiten
  una relación muchos a muchos.
- **RF-002**: el contacto admite nombre, apellidos, identificación, múltiples
  teléfonos y correos, avatar, nacimiento, dirección, canal preferido y
  consentimientos, sin exigir un teléfono ni cambiar su identidad estable.
- **RF-003**: los campos configurables soportan los nueve tipos indicados;
  definición, opciones y valores se validan en servidor.
- **RF-004**: los embudos y sus etapas son independientes; los tratos tienen
  contacto, etapa, valor y moneda y pueden moverse de forma persistente.
- **RF-005**: las actividades se clasifican en llamada, reunión, tarea o nota y
  se relacionan al menos con un contacto o un trato.
- **RF-006**: la interfaz de contactos filtra por nombre, teléfono, etiqueta,
  canal y etapa y exporta la selección completa a XLSX y PDF horizontal.
- **RF-007**: el kanban permite arrastrar tratos y refleja totales por moneda.
- **RF-008**: toda operación exige sesión y organización y comprueba el
  aislamiento de cada referencia; los datos privados no se agregan al bot.
- **RF-009**: migraciones aditivas y actualizables sin pasos manuales;
  preservación de la bandeja, canales, agenda, leads y contratos publicados.

### Entidades principales

- **Contacto**: persona con identidad de canal estable y atributos opcionales.
- **Empresa** y **vínculo**: organización comercial, matriz opcional y relación
  con uno o más contactos.
- **Definición** y **valor de campo**: configuración por negocio y valor
  validado para una entidad, con archivo privado cuando corresponda.
- **Embudo**, **etapa** y **trato**: proceso comercial, paso y negociación.
- **Actividad**: interacción o tarea vinculada a un contacto o trato.

## Criterios de éxito

- El 100 % de los escenarios anteriores pasa en una aplicación real con datos
  ficticios, incluidos los caminos de error y aislamiento entre organizaciones.
- Los datos y funciones existentes sobreviven a actualizar una instalación con
  datos; todas las pruebas existentes de contratos siguen pasando.
- Los dos formatos exportados se abren y contienen todos los resultados
  filtrados, sin incluir resultados ajenos.
- La búsqueda, creación, edición, movimiento y recarga se verifican en
  escritorio y móvil; ningún control expuesto queda sin persistencia.

## Supuestos y límites

- Se conservan los roles y permisos existentes; el RBAC granular es fase 8.
- Las funciones comerciales nuevas no reemplazan ni alteran los leads y su
  historial; los contactos existentes se mantienen sin backfill destructivo.
- Ninguna integración externa nueva es necesaria para el funcionamiento del
  núcleo. Los módulos sectoriales y la automatización quedan fuera de esta fase.
- Los campos privados y las actividades no se envían automáticamente al
  cerebro ni a Meta. Los usuarios autenticados mantienen el modelo de acceso
  existente del equipo.
