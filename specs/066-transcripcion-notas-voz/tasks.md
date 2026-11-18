# Tareas: transcripción opcional de notas de voz

- [X] T001 Especificar los criterios, límites y contrato aditivo antes del código.
- [X] T002 Añadir tablas tenant-scoped y migración aditiva para credenciales y
      cache cifrada con lease y vencimiento.
- [X] T003 Implementar API de ajustes, cifrado de llave, adaptador de proveedores
      fijos, validación de medios y manejo de timeout/errores.
- [X] T004 Extender aditivamente el despacho con el marcador explícito e integrar
      transcripción sin alterar la ingesta ni bloquear la entrega ante fallos.
- [X] T005 Añadir el control explícito en Ajustes → IA y mock de proveedor
      sintético restringido a desarrollo.
- [X] T006 Añadir pruebas unitarias y E2E sintético de camino feliz, timeout,
      audio no disponible, default off, cifrado, concurrencia y sandbox.
- [X] T007 Ejecutar verificación en entorno aislado, actualizar el plan maestro
      y registrar evidencia de la fase 3.2.

**Secuencia:** T001 precede a todas; T002 precede a T003–T006; T003 precede a
T004–T006; T004 y T005 preceden a T006; T006 precede a T007.
