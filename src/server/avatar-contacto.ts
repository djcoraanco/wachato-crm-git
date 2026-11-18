import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { borrarMediaConfirmado, guardarMedia, huellaBucket, huellaDisco, leerMedia } from "@/lib/storage/medios";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELES = 16_000_000;

function pngAnimado(bytes: Buffer): boolean {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(firma)) return false;
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const longitud = bytes.readUInt32BE(offset);
    if (offset + 12 + longitud > bytes.length) break;
    const tipo = bytes.toString("ascii", offset + 4, offset + 8);
    if (tipo === "acTL") return true;
    if (tipo === "IEND") break;
    offset += 12 + longitud;
  }
  return false;
}

export class ErrorAvatar extends Error {
  constructor(readonly status: number, readonly code: string, mensaje: string) {
    super(mensaje);
  }
}

export async function leerImagenAvatar(req: Request): Promise<Buffer> {
  const longitud = req.headers.get("content-length");
  if (longitud && (!/^\d+$/.test(longitud) || Number(longitud) > MAX_BYTES)) {
    throw new ErrorAvatar(413, "too_large", "La imagen supera 5 MB");
  }
  if (!req.body) throw new ErrorAvatar(422, "invalid_image", "Selecciona una imagen");
  const lector = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await lector.cancel();
        throw new ErrorAvatar(413, "too_large", "La imagen supera 5 MB");
      }
      partes.push(value);
    }
  } catch (error) {
    if (error instanceof ErrorAvatar) throw error;
    throw new ErrorAvatar(422, "invalid_image", "No se pudo leer la imagen enviada");
  } finally {
    lector.releaseLock();
  }
  if (!total) throw new ErrorAvatar(422, "invalid_image", "Selecciona una imagen");
  try {
    const bytes = Buffer.concat(partes);
    const imagen = sharp(bytes, { failOn: "warning", limitInputPixels: MAX_PIXELES, animated: true });
    const meta = await imagen.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || pngAnimado(bytes) ||
        !meta.width || !meta.height || meta.width * meta.height > MAX_PIXELES ||
        (meta.pages ?? 1) !== 1) {
      throw new Error("Formato no permitido");
    }
    return await imagen.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png().toBuffer();
  } catch {
    throw new ErrorAvatar(422, "invalid_image", "Imagen inválida. Usa JPEG, PNG o WebP estático de hasta 16 megapíxeles");
  }
}

export async function estadoAvatar(organizationId: string, contactId: string) {
  return getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("share");
    if (!contacto) throw new ErrorAvatar(404, "not_found", "Contacto no encontrado");
    const [avatar] = await tx.select({ id: schema.contactAvatar.id, estado: schema.contactAvatar.status })
      .from(schema.contactAvatar)
      .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.contactId, contactId)));
    return avatar ?? null;
  });
}

export async function guardarAvatar(organizationId: string, contactId: string, bytes: Buffer) {
  const id = newId("contactAvatar");
  const disco = huellaDisco();
  const bucket = huellaBucket();
  await getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("update");
    if (!contacto) throw new ErrorAvatar(404, "not_found", "Contacto no encontrado");
    const [anterior] = await tx.select({ id: schema.contactAvatar.id }).from(schema.contactAvatar)
      .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.contactId, contactId)));
    if (anterior) throw new ErrorAvatar(409, "avatar_existente", "Elimina primero el avatar anterior o la carga pendiente");
    await tx.insert(schema.contactAvatar).values({
      id, organizationId, contactId, status: "pendiente", diskFingerprint: disco, bucketFingerprint: bucket,
    });
  });
  try {
    await getDb().transaction(async (tx) => {
      const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
        .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
        .for("update");
      if (!contacto) throw new ErrorAvatar(404, "not_found", "Contacto no encontrado");
      const [avatar] = await tx.select().from(schema.contactAvatar)
        .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.id, id),
          eq(schema.contactAvatar.contactId, contactId), eq(schema.contactAvatar.status, "pendiente")))
        .for("update");
      if (!avatar) throw new ErrorAvatar(409, "carga_cancelada", "La carga ya no está disponible");
      if (avatar.diskFingerprint !== huellaDisco() || avatar.bucketFingerprint !== huellaBucket()) {
        throw new ErrorAvatar(409, "almacen_cambiado", "Conecta los almacenes originales para retirar la carga pendiente");
      }
      await guardarMedia(organizationId, id, bytes, "image/png");
      await tx.update(schema.contactAvatar).set({ status: "activo" })
        .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.id, id)));
    });
  } catch (error) {
    if (error instanceof ErrorAvatar) throw error;
    throw new ErrorAvatar(503, "almacen_no_disponible",
      "No se pudo guardar la imagen. Retira la carga pendiente antes de volver a intentar.");
  }
  return { id, estado: "activo" as const };
}

export async function leerAvatar(organizationId: string, contactId: string) {
  return getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("share");
    if (!contacto) throw new ErrorAvatar(404, "not_found", "Contacto no encontrado");
    const [avatar] = await tx.select({ id: schema.contactAvatar.id }).from(schema.contactAvatar)
      .where(scoped(schema.contactAvatar.organizationId, organizationId,
        eq(schema.contactAvatar.contactId, contactId), eq(schema.contactAvatar.status, "activo")))
      .for("share");
    if (!avatar) throw new ErrorAvatar(404, "not_found", "Avatar no encontrado");
    try {
      return await leerMedia(organizationId, avatar.id);
    } catch {
      throw new ErrorAvatar(503, "almacen_no_disponible", "No se pudo leer el avatar del almacenamiento");
    }
  });
}

export async function borrarAvatar(organizationId: string, contactId: string) {
  const avatar = await getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("update");
    if (!contacto) throw new ErrorAvatar(404, "not_found", "Contacto no encontrado");
    const [actual] = await tx.select().from(schema.contactAvatar)
      .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.contactId, contactId)))
      .for("update");
    if (!actual) throw new ErrorAvatar(404, "not_found", "Avatar no encontrado");
    if (actual.diskFingerprint !== huellaDisco() || actual.bucketFingerprint !== huellaBucket()) {
      throw new ErrorAvatar(409, "almacen_cambiado", "Conecta los almacenes originales para eliminar el avatar");
    }
    await tx.update(schema.contactAvatar).set({ status: "eliminando" })
      .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.id, actual.id)));
    return actual;
  });
  try {
    await borrarMediaConfirmado(organizationId, avatar.id);
  } catch {
    throw new ErrorAvatar(503, "almacen_no_disponible", "No se pudo eliminar el archivo. Vuelve a intentarlo.");
  }
  await getDb().transaction(async (tx) => {
    await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId))).for("update");
    await tx.delete(schema.contactAvatar)
      .where(scoped(schema.contactAvatar.organizationId, organizationId, eq(schema.contactAvatar.id, avatar.id),
        eq(schema.contactAvatar.status, "eliminando")));
  });
}
