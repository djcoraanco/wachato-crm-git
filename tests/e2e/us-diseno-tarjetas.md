# Guion E2E — Diseño de tarjetas (061)

> Automatizado en `scripts/e2e-diseno-061.mjs` (claro y oscuro, a
> 1440 y a 390 px). Spec: [061](../../specs/061-diseno-tarjetas/spec.md).

## Por qué

La referencia 061 introdujo las tarjetas y el compositor en cápsula. El
cascarón Wachato sustituye después el riel por una barra lateral con texto.

## Camino verificado

Entra una conversación, con un enlace, y sale una respuesta. En cada tema:

1. **AC1.** El lateral mide 228 px, conserva las entradas del menú, la activa
   se lee (AA) y la cabecera muestra el título de la vista.
2. **AC2.** La cuenta conserva el tema, cerrar sesión y versión.
3. **AC3.** El cliente va en burbuja de alto contraste (≥ 7:1). La hora y el
   enlace dentro de ella se leen (AA), y la respuesta también.
4. **AC4.** El envío es un botón redondo fuera de la caja, y la caja es una
   cápsula.
5. **AC5.** A 390 px:
   - el lateral está cerrado, el cajón abre y Escape lo cierra;
   - el hilo se abre;
   - sin desplazamiento horizontal.
6. Sin errores de la página.
