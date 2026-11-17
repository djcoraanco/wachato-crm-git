# Contrato del CRM universal

Las rutas nuevas serán autenticadas y estarán limitadas a la organización de
la sesión. Los cuerpos externos se validan; una referencia inexistente o de
otra organización no revela su existencia. Los errores siguen `apiError`.

No se cambian las formas ni los códigos publicados de `/api/bot/*`, despacho,
webhooks ni SSE. Las rutas y DTO internos nuevos se especificarán antes de
implementar cada tarea.
