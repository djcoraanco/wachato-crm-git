# Fase 3 — Bandeja, Conexiones y regresión

**Estado:** completado. La transcripción de notas de voz se documenta en
[03.2](./03.2-transcripcion.md).

## 3.1 — Bandeja

- La lista conserva búsqueda, no leídas y filtros; incluye «Atención manual»
  para conversaciones con IA pausada o traspasadas a una persona, además de
  vencimiento, anuncio y etapa.
- En escritorio, la lista y los detalles usan paneles de 300 px alrededor del
  hilo; en móvil, la lista y el hilo se alternan y los detalles se abren como
  cajón. Se mantiene la navegación de retorno.
- El E2E `scripts/e2e-filtro-manual.mjs` verificó el filtro, su limpieza, su
  combinación con otros filtros y el flujo móvil.
- `scripts/e2e-selftest.mjs` verificó 295/295 comportamientos, incluidos
  mensajes e ingesta, ventanas, límites, adjuntos, agenda y contratos del
  cerebro. La suite unitaria conserva los guardarraíles del sandbox. No se
  modificó el contrato público `/api/bot/*` ni el transporte SSE.

## 3.3 — Conexiones

- La vista presenta los canales disponibles, plantillas y actividad de CAPI
  con datos de la organización; no presenta estados de revisión de Meta que la
  API no entregue.
- `scripts/e2e-conexiones.mjs` verificó permisos, aislamiento, vista móvil y
  atribución encendida y apagada.

## 3.4 — Gates finales

- `pnpm typecheck`: aprobado.
- `pnpm lint`: aprobado.
- `pnpm test`: 132 archivos y 1431 pruebas aprobados.
- `pnpm build`: aprobado; también pasó `scripts/check-export-trace.mjs`.
- Self-test E2E contra aplicación local, PostgreSQL aislado y mocks:
  **295/295 comprobaciones aprobadas**.
- La transcripción opcional pasó su suite y E2E dedicados, incluido proveedor
  simulado, indisponibilidad y continuidad del despacho; su evidencia está en
  [03.2](./03.2-transcripcion.md).
- No se construyó la imagen Docker porque Docker no está disponible en este
  equipo.
