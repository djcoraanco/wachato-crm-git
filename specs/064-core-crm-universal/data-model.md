# Modelo: CRM universal

## Empresas y perfil adicional (2.1)

- `contact_profile`: una fila opcional por contacto, con identificador de
  organización y referencia al contacto. Atributos personales opcionales
  separados del contacto que lee el bot; no se interpreta ausencia como
  consentimiento.
- `contact_avatar`: como máximo una fila por contacto y organización. Un ID
  aleatorio identifica el archivo privado; las huellas del disco y del bucket
  evitan borrar en ubicaciones distintas. Los estados `pendiente`, `activo` y
  `eliminando` conservan la referencia ante fallos. Las claves foráneas
  restringen el borrado del contacto y de la organización mientras exista.
  Los contactos anteriores no necesitan conversión ni archivo asociado.
- `company`: identificador, organización, razón social, identificación fiscal,
  teléfono, dirección y matriz opcionales; timestamps.
- `company_contact`: identificador de organización y par empresa/contacto
  único; la misma persona puede vincularse a múltiples empresas.
- Las referencias compuestas incluyen la organización, para que la propia base
  rechace conexiones entre tenants. Al borrar un contacto o empresa solo se
  eliminan sus vínculos; no se elimina la otra entidad.
- La matriz debe pertenecer a la misma organización. La comprobación de ciclos
  corresponde al servicio de edición, transaccional y probado antes de exponerlo.
- Las etiquetas del contacto son una lista JSONB propia del contacto, vacía por
  defecto, de hasta 30 valores únicos de 40 caracteres. Se editan desde el
  contacto y se aplican por igual en el listado y sus exportaciones; no cambian
  la ficha ni el contrato del bot.

## Campos personalizados (2.2)

- La definición pertenece a una organización y a un tipo de entidad; contiene
  clave estable, etiqueta, tipo y, para select y multiselect, opciones únicas.
- El valor se guarda como JSONB indexado, con una única entrada por definición
  y entidad. La validación no convierte silenciosamente valores a otro tipo.
- Contactos y empresas usan referencias compuestas separadas y claves foráneas
  al tenant. El soporte de tratos se añadirá junto con su modelo en 2.3.
- Moneda usa centavos enteros y moneda admitida; fechas usan `AAAA-MM-DD` real.
  Los JSON y textos tienen límites; las selecciones deben estar en las opciones.
- Los archivos son objetos privados propios de la organización, con tamaño
  limitado, descargados como adjunto mediante sesión. No se utiliza la API de
  media del bot, que es un contrato público distinto.
- Cada archivo pertenece a una definición y hereda su visibilidad actual. Para
  retirarlo se rechaza si hay valores que lo referencian y se marca
  `eliminando` antes de borrar el objeto; un fallo conserva el registro para
  reintentar sin permitir nuevas referencias.
- Antes de guardar el binario se registra el archivo como carga pendiente.
  Solo queda disponible tras confirmarse la escritura; una carga interrumpida
  sigue visible en la lista para que pueda retirarse sin perder su referencia.
- La ubicación de un bucket se identifica mediante una huella sin credenciales;
  no se confirma su borrado si el bucket configurado ya no coincide. Para
  registros anteriores sin ubicación, un administrador debe confirmar que
  están conectados los almacenes originales antes de retirarlos.
- Una guarda en la base impide eliminar la organización mientras sus archivos
  sigan registrados o en proceso de borrado. El borrado de la organización
  indica que primero deben retirarse los archivos; no elimina metadatos antes
  de confirmar la retirada física.
- La visibilidad es `privado` por defecto; el dueño o administrador puede
  compartir individualmente el campo con el equipo o revocar el acceso.
- La definición de tipo u opciones que ya tenga valores no puede cambiarse
  silenciosamente de manera que invalide datos existentes.

## Embudos y actividades (2.3)

- El embudo predeterminado es el tablero existente: sus etapas siguen en
  `pipeline_stage` y sus leads no se duplican ni se migran. Sus movimientos
  siguen pasando exclusivamente por `stage-history.ts`. Los demás embudos y
  sus etapas son tablas nuevas, independientes del tablero del bot.
- Los tratos adicionales pertenecen a un contacto y pueden vivir en el
  embudo predeterminado o en uno adicional. En el primero apuntan a una etapa
  existente; en los demás, a una etapa del embudo correspondiente. La base
  rechaza combinaciones de organización, embudo y etapa ajenas y obliga a
  elegir exactamente una clase de etapa. No se crea un lead por cada trato.
- El importe es opcional, expresado en centavos enteros y acompañado por su
  moneda. Los totales se presentan separados por moneda, sin conversión.
- Una actividad de tipo llamada, reunión, tarea o nota se vincula al menos a
  un contacto, trato adicional o lead existente y no se entrega al bot.
  Todas las referencias son de la misma organización. Si se indica un contacto
  y un trato, el contacto debe coincidir con el del trato.
- Las definiciones y valores configurables de tratos usan tablas aditivas
  propias, pues la restricción existente de campos de contactos y empresas no
  admite un tercer tipo sin modificar una migración previa. Comparten las
  mismas reglas de validación y visibilidad. Los archivos reutilizan los
  metadatos y la guarda de almacenamiento privado mediante un vínculo a la
  definición del trato; no se puede borrar un archivo mientras esté vinculado.
- El cambio de etapa de un trato adicional es transaccional y registra su
  historial; ni sus tratos ni actividades modifican los leads, estadísticas
  históricas o contratos del cerebro. Las etapas usadas no se eliminan
  silenciosamente.
- Con `ATRIBUCION` encendida, cada etapa puede elegir un evento adicional del
  catálogo oficial de Meta para `business_messaging`. Los eventos existentes
  del embudo principal se conservan; se comparte la deduplicación existente
  por organización, conversación y nombre del evento. Sin conversación real
  de WhatsApp no se envía un evento de trato; sin `ctwa_clid` se registra como
  omitido. El evento se reporta después de confirmar el cambio.
- Para evitar borrar datos comerciales por cascada o devolver un error de base,
  eliminar un contacto se bloquea mientras tenga tratos, actividades, vínculos
  con empresas o valores personalizados.
