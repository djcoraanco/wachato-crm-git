# App Shell Wachato

**Carril:** ligero, sin migración ni cambio de contrato público.  
**Nota:** especificación escrita después de la implementación; documenta el
alcance ya solicitado en el plan maestro y el prototipo.

## Problema

El riel de iconos no corresponde al lateral con texto del prototipo y hace
menos visibles las secciones existentes del CRM.

## Criterios de aceptación

1. En escritorio hay un lateral de 228 px con las secciones existentes, la
   entrada activa y el contador real de mensajes sin leer de la Bandeja.
2. El lateral presenta por defecto el logotipo Wachato y conserva la marca
   personalizada, el nombre de la organización,
   cuenta, tema, sonido, avisos, instalación, cierre de sesión y versión.
3. Las entradas siguen respetando el rol y las banderas del despliegue; no se
   quita ningún canal ni la agenda.
4. La cabecera indica la vista actual y la fecha local. La Bandeja conserva su
   área de trabajo sin scroll adicional del cascarón.
5. En móvil el menú abre, cierra con Escape y al navegar; no hay desborde
   horizontal. Los enlaces y controles son accesibles por teclado.
6. El texto activo alcanza contraste AA en los temas Wachato claro y oscuro.

## Fuera de alcance

- Cambios a las pantallas internas, contratos públicos o esquema de datos.
- Estado «Producción» o datos de ejemplo: no se muestra un estado que el
  cascarón no pueda verificar.
- Implantación de módulos o cambios en el nombre de marca personalizado de una
  organización.
