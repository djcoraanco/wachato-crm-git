# US — Transcripción opcional de notas de voz

## Preparación

- PostgreSQL de E2E separado, con migraciones aplicadas.
- App en `localhost` con `WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` apuntando
  al wa-mock y despacho a un cerebro local falso.
- `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_WA_TOKEN` y `E2E_TRANSCRIPTION_TOKEN`
  pertenecen solo al entorno de pruebas.
- El guion valida primero que `/api/dev/transcription-mock` está habilitado.
  Si no lo está, no envía ningún audio.

## Camino feliz y camino infeliz

1. Con configuración ausente, el CRM recibe una nota Ogg sintética, la guarda
   y la despacha con el contrato anterior; el proveedor no recibe solicitudes.
2. Al activar OpenAI-compatible con una llave de prueba, el mock recibe solo
   `file` y `model`; el cerebro recibe `transcription.status=ready` y texto
   sintético. La llave y la identidad no aparecen en la solicitud al mock.
3. La transcripción no aparece en la API de mensajes de la Bandeja.
4. Si el proveedor simulado responde 503, el mensaje igual llega al cerebro con
   `transcription.status=unavailable`; el fallo de transcripción no inicia
   reintentos del outbox.
5. Si el proveedor simulado tarda más del límite, el mensaje se despacha con
   `unavailable` tras el timeout; no queda retenido el worker.
6. El guion quita la credencial y apaga el agente al finalizar.

Ejecutar desde una instancia de pruebas aislada:

```powershell
node --env-file=.env.e2e-066 scripts/e2e-transcripcion.mjs
```

El audio lo sirve `src/app/api/dev/wa-mock/media-file/[id]/route.ts`; nunca se
lee ni envía una nota de voz real.
