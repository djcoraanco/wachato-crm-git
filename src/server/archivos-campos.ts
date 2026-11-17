import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { borrarMediaConfirmado, bucketPedido, huellaBucket, huellaDisco } from "@/lib/storage/medios";
import { readMediaFile, saveMediaFile } from "@/server/whatsapp/media";
import { ErrorCampo } from "@/server/campos-personalizados";

export const MAX_ARCHIVO_CAMPO = 10 * 1024 * 1024;

export function validarAlmacenParaBorrado(
  archivo: Pick<typeof schema.customFieldFile.$inferSelect, "storageRecorded" | "bucketFingerprint" | "diskFingerprint">,
  puedeAdministrar: boolean,
  confirmarAlmacenAnterior: boolean
) {
  if (!archivo.storageRecorded && !(puedeAdministrar && confirmarAlmacenAnterior)) {
    throw new ErrorCampo(409, "almacen_desconocido", "Un administrador debe confirmar que están conectados los almacenes originales");
  }
  if (archivo.bucketFingerprint && archivo.bucketFingerprint !== huellaBucket()) {
    throw new ErrorCampo(409, "almacen_cambiado", "Conecta el bucket original para confirmar el borrado");
  }
  if (archivo.storageRecorded && archivo.diskFingerprint !== huellaDisco()) {
    throw new ErrorCampo(409, "almacen_cambiado", "Conecta el disco original para confirmar el borrado");
  }
}

export async function leerArchivoLimitado(req: Request): Promise<Uint8Array> {
  const longitud = req.headers.get("content-length");
  if (longitud && (!/^\d+$/.test(longitud) || Number(longitud) > MAX_ARCHIVO_CAMPO)) {
    throw new ErrorCampo(413, "too_large", "El archivo supera 10 MB");
  }
  if (!req.body) throw new ErrorCampo(422, "empty", "No llegó ningún archivo");
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_ARCHIVO_CAMPO) {
        await lector.cancel();
        throw new ErrorCampo(413, "too_large", "El archivo supera 10 MB");
      }
      partes.push(value);
    }
  } finally {
    lector.releaseLock();
  }
  if (!total) throw new ErrorCampo(422, "empty", "No llegó ningún archivo");
  return Buffer.concat(partes);
}

export async function guardarArchivoCampo(
  organizationId: string,
  fieldId: string,
  puedeAdministrar: boolean,
  nombre: string,
  bytes: Uint8Array
) {
  const id = newId("customFieldFile");
  const bucket = bucketPedido() ? huellaBucket() : null;
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId,
        eq(schema.customField.id, fieldId), eq(schema.customField.kind, "archivo"),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    await tx.insert(schema.customFieldFileGuard).values({ organizationId, fileId: id });
    const [archivo] = await tx.insert(schema.customFieldFile)
      .values({
        id, organizationId, name: nombre, size: bytes.byteLength,
        fieldId: campo.id, fieldEntity: campo.entity, uploadPending: true,
        storageRecorded: true, bucketFingerprint: bucket, diskFingerprint: huellaDisco(),
      })
      .returning();
    if (!archivo) throw new Error("No se pudo registrar el archivo");
  });
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.customField.id }).from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId,
        eq(schema.customField.id, fieldId), eq(schema.customField.kind, "archivo"),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "activo"),
        eq(schema.customFieldFile.uploadPending, true)))
      .for("update");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Carga de archivo no encontrada");
    if ((bucketPedido() ? huellaBucket() : null) !== archivo.bucketFingerprint ||
        huellaDisco() !== archivo.diskFingerprint) {
      throw new ErrorCampo(409, "almacen_cambiado", "La configuración del almacén cambió durante la carga");
    }
    await saveMediaFile(organizationId, id, bytes, "application/octet-stream");
    await tx.update(schema.customFieldFile).set({ uploadPending: false })
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)));
    return { id: archivo.id, nombre: archivo.name, tamano: archivo.size };
  });
}

export async function obtenerArchivoCampo(organizationId: string, id: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [inicial] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "activo"),
        eq(schema.customFieldFile.uploadPending, false)));
    if (!inicial) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    if (!puedeAdministrar) {
      if (!inicial.fieldId) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
      const [campo] = await tx.select({ id: schema.customField.id }).from(schema.customField)
        .where(scoped(schema.customField.organizationId, organizationId,
          eq(schema.customField.id, inicial.fieldId),
          eq(schema.customField.kind, "archivo"),
          eq(schema.customField.visibility, "equipo")))
        .for("share");
      if (!campo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    }
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "activo"),
        eq(schema.customFieldFile.uploadPending, false)))
      .for("share");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    return { nombre: archivo.name, bytes: await readMediaFile(organizationId, id) };
  });
}

export async function listarArchivosCampo(organizationId: string, fieldId: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.customField.id }).from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId,
        eq(schema.customField.id, fieldId), eq(schema.customField.kind, "archivo"),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("share");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    const archivos = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.fieldId, fieldId)));
    return archivos.map((archivo) => ({
      id: archivo.id, nombre: archivo.name, tamano: archivo.size,
      estado: archivo.status === "eliminando" ? "eliminando" : archivo.uploadPending ? "pendiente" : "activo",
    }));
  });
}

export async function borrarArchivoCampo(
  organizationId: string, id: string, puedeAdministrar: boolean, confirmarAlmacenAnterior: boolean
) {
  const archivoParaBorrar = await getDb().transaction(async (tx) => {
    const [inicial] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)));
    if (!inicial) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [archivoTrato] = await tx.select({ id: schema.salesDealFieldFile.fileId })
      .from(schema.salesDealFieldFile)
      .where(scoped(schema.salesDealFieldFile.organizationId, organizationId,
        eq(schema.salesDealFieldFile.fileId, id)));
    if (archivoTrato) throw new ErrorCampo(409, "archivo_asociado", "Usa la gestión de archivos del campo de trato");
    if (inicial.fieldId) {
      const [campo] = await tx.select({ id: schema.customField.id }).from(schema.customField)
        .where(scoped(schema.customField.organizationId, organizationId,
          eq(schema.customField.id, inicial.fieldId),
          puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
        .for("update");
      if (!campo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    } else if (!puedeAdministrar) {
      throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    }
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)))
      .for("update");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [contactos, empresas] = await Promise.all([
      tx.select({ id: schema.contactCustomValue.fieldId }).from(schema.contactCustomValue)
        .where(scoped(schema.contactCustomValue.organizationId, organizationId,
          archivo.fieldId ? eq(schema.contactCustomValue.fieldId, archivo.fieldId) : undefined,
          sql`${schema.contactCustomValue.value}->>'id' = ${id}`)).limit(1),
      tx.select({ id: schema.companyCustomValue.fieldId }).from(schema.companyCustomValue)
        .where(scoped(schema.companyCustomValue.organizationId, organizationId,
          archivo.fieldId ? eq(schema.companyCustomValue.fieldId, archivo.fieldId) : undefined,
          sql`${schema.companyCustomValue.value}->>'id' = ${id}`)).limit(1),
    ]);
    if (contactos.length || empresas.length) {
      throw new ErrorCampo(409, "archivo_en_uso", "El archivo está vinculado a un valor");
    }
    validarAlmacenParaBorrado(archivo, puedeAdministrar, confirmarAlmacenAnterior);
    await tx.update(schema.customFieldFile).set({ status: "eliminando" })
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)));
    return archivo;
  });
  await borrarMediaConfirmado(organizationId, id);
  await getDb().transaction(async (tx) => {
    await tx.delete(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "eliminando")));
    await tx.delete(schema.customFieldFileGuard)
      .where(scoped(schema.customFieldFileGuard.organizationId, organizationId,
        eq(schema.customFieldFileGuard.fileId, archivoParaBorrar.id)));
  });
}
