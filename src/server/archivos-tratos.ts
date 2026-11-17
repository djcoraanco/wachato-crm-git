import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { borrarMediaConfirmado, bucketPedido, huellaBucket, huellaDisco } from "@/lib/storage/medios";
import { readMediaFile, saveMediaFile } from "@/server/whatsapp/media";
import { validarAlmacenParaBorrado } from "@/server/archivos-campos";
import { ErrorCampo } from "@/server/campos-personalizados";

export async function guardarArchivoTrato(
  organizationId: string, fieldId: string, puedeAdministrar: boolean, nombre: string, bytes: Uint8Array
) {
  const id = newId("customFieldFile");
  const bucket = bucketPedido() ? huellaBucket() : null;
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId,
        eq(schema.salesDealField.id, fieldId), eq(schema.salesDealField.kind, "archivo"),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    await tx.insert(schema.customFieldFileGuard).values({ organizationId, fileId: id });
    await tx.insert(schema.customFieldFile).values({
      id, organizationId, name: nombre, size: bytes.byteLength, uploadPending: true,
      storageRecorded: true, bucketFingerprint: bucket, diskFingerprint: huellaDisco(),
    });
    await tx.insert(schema.salesDealFieldFile).values({ organizationId, fieldId, fileId: id });
  });
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "activo"),
        eq(schema.customFieldFile.uploadPending, true))).for("update");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Carga de archivo no encontrada");
    if ((bucketPedido() ? huellaBucket() : null) !== archivo.bucketFingerprint || huellaDisco() !== archivo.diskFingerprint) {
      throw new ErrorCampo(409, "almacen_cambiado", "La configuración del almacén cambió durante la carga");
    }
    await saveMediaFile(organizationId, id, bytes, "application/octet-stream");
    await tx.update(schema.customFieldFile).set({ uploadPending: false })
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)));
    return { id, nombre, tamano: archivo.size };
  });
}

export async function listarArchivosTrato(organizationId: string, fieldId: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId,
        eq(schema.salesDealField.id, fieldId), eq(schema.salesDealField.kind, "archivo"),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("share");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo de archivo no encontrado");
    const archivos = await tx.select({ archivo: schema.customFieldFile }).from(schema.salesDealFieldFile)
      .innerJoin(schema.customFieldFile, eq(schema.salesDealFieldFile.fileId, schema.customFieldFile.id))
      .where(scoped(schema.salesDealFieldFile.organizationId, organizationId,
        eq(schema.salesDealFieldFile.fieldId, fieldId), eq(schema.customFieldFile.organizationId, organizationId)));
    return archivos.map(({ archivo }) => ({
      id: archivo.id, nombre: archivo.name, tamano: archivo.size,
      estado: archivo.status === "eliminando" ? "eliminando" : archivo.uploadPending ? "pendiente" : "activo",
    }));
  });
}

export async function obtenerArchivoTrato(organizationId: string, id: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [vinculo] = await tx.select().from(schema.salesDealFieldFile)
      .where(scoped(schema.salesDealFieldFile.organizationId, organizationId, eq(schema.salesDealFieldFile.fileId, id)));
    if (!vinculo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId,
        eq(schema.salesDealField.id, vinculo.fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo"))).for("share");
    if (!campo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "activo"),
        eq(schema.customFieldFile.uploadPending, false))).for("share");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    return { nombre: archivo.name, bytes: await readMediaFile(organizationId, id) };
  });
}

export async function borrarArchivoTrato(
  organizationId: string, id: string, puedeAdministrar: boolean, confirmar: boolean
) {
  await getDb().transaction(async (tx) => {
    const [vinculo] = await tx.select().from(schema.salesDealFieldFile)
      .where(scoped(schema.salesDealFieldFile.organizationId, organizationId, eq(schema.salesDealFieldFile.fileId, id)));
    if (!vinculo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, vinculo.fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo"))).for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [archivo] = await tx.select().from(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id))).for("update");
    if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    const [valor] = await tx.select({ id: schema.salesDealCustomValue.fieldId }).from(schema.salesDealCustomValue)
      .where(scoped(schema.salesDealCustomValue.organizationId, organizationId,
        eq(schema.salesDealCustomValue.fieldId, vinculo.fieldId),
        sql`${schema.salesDealCustomValue.value}->>'id' = ${id}`)).limit(1);
    if (valor) throw new ErrorCampo(409, "archivo_en_uso", "El archivo está vinculado a un valor");
    validarAlmacenParaBorrado(archivo, puedeAdministrar, confirmar);
    await tx.update(schema.customFieldFile).set({ status: "eliminando" })
      .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.id, id)));
  });
  await borrarMediaConfirmado(organizationId, id);
  await getDb().transaction(async (tx) => {
    await tx.delete(schema.salesDealFieldFile)
      .where(scoped(schema.salesDealFieldFile.organizationId, organizationId, eq(schema.salesDealFieldFile.fileId, id)));
    await tx.delete(schema.customFieldFile)
      .where(scoped(schema.customFieldFile.organizationId, organizationId,
        eq(schema.customFieldFile.id, id), eq(schema.customFieldFile.status, "eliminando")));
    await tx.delete(schema.customFieldFileGuard)
      .where(scoped(schema.customFieldFileGuard.organizationId, organizationId, eq(schema.customFieldFileGuard.fileId, id)));
  });
}
