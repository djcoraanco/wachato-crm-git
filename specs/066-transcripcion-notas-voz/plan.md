# Plan: transcripción opcional de notas de voz

**Fecha:** 2026-11-17  
**Spec:** [spec.md](./spec.md)

## Decisiones de diseño

1. Credencial independiente por organización en `voice_transcription_credentials`;
   token cifrado AES-256-GCM. La fila ausente significa apagado. Solo el dueño
   o miembro autenticado configura el conector mediante `/api/settings/transcription`.
2. Proveedores cerrados a OpenAI y Groq: endpoints HTTPS fijos en el servidor,
   modelos de transcripción fijos por proveedor. Así una configuración de
   organización no puede convertir el servidor en un proxy SSRF. El mock local
   solo sustituye el endpoint fuera de producción cuando `WA_MOCK_ENABLED=true`.
3. La transcripción se genera al construir el despacho, nunca en la ruta de
   ingesta. El intento tiene timeout estricto de 4 s; cualquier resultado
   ausente/fallido produce `unavailable` y el worker entrega el evento normal.
   Máximo tres audios por evento y concurrencia acotada.
4. Se lee únicamente el asset disponible en el almacenamiento propio. No se
   reintenta la descarga desde Meta para transcribir ni se envía al proveedor
   información contextual. MIME, firma y tamaño se verifican antes del POST.
5. Cache tenant-scoped por `media_asset_id`, cifrada y con vencimiento a 24 h.
   El estado y lease se reclaman con actualización condicional para impedir
   solicitudes duplicadas concurrentes y para no repetir llamadas tras
   reintentos del outbox.
6. La extensión del contrato va al final del mensaje y solo se emite si la
   organización activó la función. El cuerpo fijado por la prueba byte a byte
   permanece idéntico cuando la opción está apagada.
7. Un panel pequeño se añade a Ajustes → IA; no se modifica la Bandeja, las
   Conexiones ni superficies de contactos/pipeline.

## Secuencia

1. Aprobar especificación, contrato aditivo y límites de privacidad.
2. Añadir esquema y migración aditiva para credencial y cache cifrada.
3. Implementar persistencia/configuración, adaptador y validaciones.
4. Añadir el marcador aditivo al contrato y enriquecer el despacho de forma
   tolerante a fallos, solo para audio elegible y conversación real.
5. Añadir interfaz de activación, pruebas unitarias, mock de desarrollo y E2E
   con audio sintético.
6. Verificar los tests focalizados, typecheck/lint y E2E en una copia aislada;
   no ejecutar `next build` en la raíz.

## Riesgos y mitigaciones

- **El proveedor no responde:** abort a los 4 s y el despacho continúa con
  `unavailable`.
- **Almacenamiento no disponible:** no se contacta al proveedor; el mensaje
  conserva su `mediaId`.
- **Duplicación por lease/reintento:** claim atómico y cache cifrada.
- **Proveedor o credencial cruzada:** endpoints fijos, scope obligatorio y
  prueba de ausencia de token/contexto en el mock.
- **Cambio de contrato:** solo se añade una llave opcional final; fixture
  anterior sin configuración debe seguir idéntico.
