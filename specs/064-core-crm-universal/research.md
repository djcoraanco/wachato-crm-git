# Decisiones de arquitectura

## Datos del contacto

**Decisión:** separar los atributos nuevos del registro de identidad del canal.
**Motivo:** el bot y la ingesta ya leen el contacto; ampliar su serialización
automáticamente podría filtrar datos personales o cambiar contratos.

## Embudos adicionales

**Decisión del responsable:** integrar los leads existentes en el embudo
predeterminado manteniendo compatibilidad. La única puerta de escritura del
lead y su bitácora se conservan; el bot y las estadísticas dependen de ellas.

## Aislamiento

**Decisión:** además de `scoped()`, usar claves foráneas compuestas por
organización cuando una relación une datos de dominio.
**Motivo:** una comprobación solo en UI o una clave por ID no garantiza por sí
sola la integridad entre organizaciones.

## Exportaciones

La selección de librerías para XLSX y PDF queda por evaluar antes de la tarea
2.4: compatibilidad de licencia, mantenimiento, tamaño y seguridad. No se envían
datos a un servicio externo.

## Acceso a campos privados

**Decisión del responsable:** privado por defecto y compartible por campo con
el equipo. El bot no recibe los campos, sus valores ni sus archivos.
