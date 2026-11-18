# 066 — Transcripción opcional de notas de voz entrantes

**Fecha:** 2026-11-17  
**Estado:** implementada y verificada (2026-11-17)  
**Carril:** ciclo completo: añade credenciales por organización y extiende de forma aditiva el DTO público de despacho.

## Problema

Un cerebro externo puede recibir el adjunto de una nota de voz, pero no todos
los cerebros ni modelos pueden transcribir audio. El CRM debe poder ofrecer una
transcripción opcional sin hacerla requisito para recibir, guardar o despachar
el mensaje.

## Comportamiento y criterios de aceptación

1. La transcripción está apagada por defecto. Sin una credencial cifrada y una
   activación explícita de la organización no se hace ninguna llamada al
   proveedor y el cuerpo de despacho existente permanece byte por byte igual.
2. Solo se transcriben audios entrantes de conversaciones reales de WhatsApp,
   con el adaptador configurado y el archivo ya disponible localmente. Los
   mensajes del Laboratorio (`conversation.test`) nunca salen a un proveedor de
   transcripción.
3. La solicitud al proveedor OpenAI-compatible lleva únicamente el archivo y
   el modelo de transcripción fijo del proveedor. No lleva identidad, teléfono,
   texto, caption, conversación, IDs de Vocero ni token de WhatsApp.
4. El proveedor se selecciona entre endpoints HTTPS conocidos de OpenAI y
   Groq; no se acepta una URL elegida por la organización. En desarrollo con
   mocks se permite sustituir el endpoint solo con el gate de mocks activo.
5. Se validan tipo, firma básica y tamaño del archivo antes de enviar audio.
   Una media ausente, inválida, demasiado grande, un timeout, una respuesta
   malformada o cualquier fallo del proveedor no elimina ni oculta el mensaje,
   no hace fallar el despacho y no se registra el contenido en logs. Los fallos
   inesperados se hacen observables con registros estructurados sin secretos,
   identificadores ni contenido.
6. La respuesta se conserva cifrada en reposo, ligada al asset y a la
   organización, con vencimiento. Un único lease por asset evita llamadas
   concurrentes/repetidas durante el procesamiento; mensajes duplicados
   conservan la idempotencia existente por `wa_message_id`.
7. Cuando la activación está encendida, cada audio elegible del evento añade
   `transcription: { status: "ready", text: "…" }` o
   `transcription: { status: "unavailable" }`. La propiedad es aditiva,
   aparece al final de las claves previas del mensaje y no reemplaza `text`,
   `mediaId`, MIME ni otro campo. Nunca se adjunta el audio crudo a la
   transcripción del despacho.
8. Una desconexión de disco/bucket no dispara una descarga adicional de Meta
   desde el camino de transcripción; si el archivo no se puede leer localmente,
   se despacha el mensaje con marcador `unavailable`.
9. El panel de Ajustes permite configurar proveedor y llave, mostrar solo los
   últimos cuatro caracteres y activar/desactivar el envío explícito. Al
   desactivar se conserva la llave para una reactivación deliberada; al quitar
   la configuración se elimina.
10. Tests unitarios cubren validación, cifrado, timeout, fallos, idempotencia y
    contrato. Un E2E con audio sintético y proveedor simulado verifica el
    marcador y el camino infeliz sin contactar servicios externos.

## Privacidad y límites

- La llave del proveedor se cifra con AES-256-GCM y nunca vuelve al cliente.
- La transcripción se cifra con el mismo mecanismo, solo se expone al cerebro
  bajo el marcador explícito y expira a las 24 horas.
- El archivo original no se borra ni se altera; la opción no afecta el
  funcionamiento base del CRM ni el acceso existente del cerebro a media.
- El adaptador solo acepta Ogg, MPEG, MP4/M4A, AAC y AMR de hasta 16 MiB;
  máximo de 4 segundos por solicitud; a lo sumo tres audios por evento.
- Si no está activada, la transcripción no añade campos al despacho.

## Fuera de alcance

- Mostrar, buscar o editar transcripciones en la Bandeja.
- Transcribir salientes, ecos manuales, canales distintos de WhatsApp o
  conversaciones del Laboratorio.
- Reemplazar el audio por texto, mandar credenciales de WhatsApp al proveedor
  o incorporar un servicio externo obligatorio.

## Revisión constitucional

- **I Seguridad:** tokens y transcripciones cifrados; payload mínimo y sin
  contenido en logs; aislamiento por organización.
- **II Soberanía:** conector apagado por defecto, endpoint conocido, camino
  completo sin proveedor y fallo degradado al cerebro con el audio original.
- **III Multi-tenancy:** credenciales y caché se consultan siempre con
  `organization_id`; cada fila de dominio lo requiere.
- **IV Idempotencia:** cache/lease único por asset y dedup actual del mensaje.
- **V/IX Verificación:** unitarios + self-test E2E con datos y proveedor
  sintéticos, incluido fallo y timeout.
- **VI Specs antes de código:** ciclo completo por migración y DTO público.
- **VII Trazabilidad:** los límites, el proveedor y el marcador quedan
  declarados aquí y en el plan.
