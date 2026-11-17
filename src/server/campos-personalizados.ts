import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  definicionCampoSchema,
  esquemaValorCampo,
  type DefinicionCampo,
  type EdicionCampo,
} from "@/lib/campos-personalizados";

export class ErrorCampo extends Error {
  constructor(readonly status: number, readonly code: string, mensaje: string) {
    super(mensaje);
  }
}

function dto(campo: typeof schema.customField.$inferSelect) {
  return {
    id: campo.id,
    entidad: campo.entity,
    clave: campo.key,
    nombre: campo.name,
    tipo: campo.kind,
    opciones: campo.options,
    visibilidad: campo.visibility,
  };
}

export async function listarCampos(organizationId: string, puedeAdministrar: boolean) {
  const filas = await getDb().select().from(schema.customField)
    .where(scoped(schema.customField.organizationId, organizationId,
      puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
    .orderBy(asc(schema.customField.name), asc(schema.customField.id));
  return filas.map(dto);
}

export async function crearCampo(organizationId: string, campo: DefinicionCampo) {
  try {
    const [fila] = await getDb().insert(schema.customField).values({
      id: newId("customField"),
      organizationId,
      entity: campo.entidad,
      key: campo.clave,
      name: campo.nombre,
      kind: campo.tipo,
      options: campo.opciones,
      visibility: campo.visibilidad,
    }).returning();
    if (!fila) throw new Error("No se pudo guardar la definición");
    return dto(fila);
  } catch (error) {
    const causa = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (causa && typeof causa === "object" && "code" in causa && causa.code === "23505") {
      throw new ErrorCampo(409, "duplicado", "Ya existe un campo con esa clave para esta entidad");
    }
    throw error;
  }
}

export async function leerValoresCampo(organizationId: string, fieldId: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("share");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    if (campo.entity === "contacto") {
      return tx.select({
        entidadId: schema.contactCustomValue.contactId,
        valor: schema.contactCustomValue.value,
      }).from(schema.contactCustomValue)
        .where(scoped(schema.contactCustomValue.organizationId, organizationId, eq(schema.contactCustomValue.fieldId, fieldId)));
    }
    return tx.select({
      entidadId: schema.companyCustomValue.companyId,
      valor: schema.companyCustomValue.value,
    }).from(schema.companyCustomValue)
      .where(scoped(schema.companyCustomValue.organizationId, organizationId, eq(schema.companyCustomValue.fieldId, fieldId)));
  });
}

export async function editarCampo(organizationId: string, fieldId: string, cambios: EdicionCampo) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId)))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const propuesta = definicionCampoSchema.safeParse({
      entidad: campo.entity,
      clave: campo.key,
      nombre: cambios.nombre ?? campo.name,
      tipo: campo.kind,
      opciones: cambios.opciones ?? campo.options,
      visibilidad: cambios.visibilidad ?? campo.visibility,
    });
    if (!propuesta.success) {
      throw new ErrorCampo(422, "definicion_invalida", propuesta.error.issues.map((i) => i.message).join("; "));
    }
    if (cambios.opciones !== undefined) {
      const valores = campo.entity === "contacto"
        ? await tx.select({ valor: schema.contactCustomValue.value }).from(schema.contactCustomValue)
          .where(scoped(schema.contactCustomValue.organizationId, organizationId, eq(schema.contactCustomValue.fieldId, fieldId)))
        : await tx.select({ valor: schema.companyCustomValue.value }).from(schema.companyCustomValue)
          .where(scoped(schema.companyCustomValue.organizationId, organizationId, eq(schema.companyCustomValue.fieldId, fieldId)));
      const validador = esquemaValorCampo({ tipo: campo.kind, opciones: propuesta.data.opciones });
      if (valores.some(({ valor }) => !validador.safeParse(valor).success)) {
        throw new ErrorCampo(409, "opciones_en_uso", "Hay valores guardados que quedarían inválidos");
      }
    }
    const [actualizado] = await tx.update(schema.customField)
      .set({
        name: propuesta.data.nombre,
        options: propuesta.data.opciones,
        visibility: propuesta.data.visibilidad,
        updatedAt: new Date(),
      })
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId)))
      .returning();
    if (!actualizado) throw new Error("No se pudo actualizar el campo");
    return dto(actualizado);
  });
}

export async function borrarCampo(organizationId: string, fieldId: string) {
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.customField.id }).from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId)))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const [contacto, empresa, archivo] = await Promise.all([
      tx.select({ id: schema.contactCustomValue.fieldId }).from(schema.contactCustomValue)
        .where(scoped(schema.contactCustomValue.organizationId, organizationId, eq(schema.contactCustomValue.fieldId, fieldId))).limit(1),
      tx.select({ id: schema.companyCustomValue.fieldId }).from(schema.companyCustomValue)
        .where(scoped(schema.companyCustomValue.organizationId, organizationId, eq(schema.companyCustomValue.fieldId, fieldId))).limit(1),
      tx.select({ id: schema.customFieldFile.id }).from(schema.customFieldFile)
        .where(scoped(schema.customFieldFile.organizationId, organizationId, eq(schema.customFieldFile.fieldId, fieldId))).limit(1),
    ]);
    if (contacto.length || empresa.length || archivo.length) {
      throw new ErrorCampo(409, "campo_en_uso", "El campo tiene valores o archivos; elimínalos antes");
    }
    await tx.delete(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId)));
  });
}

export async function borrarValorCampo(
  organizationId: string,
  fieldId: string,
  entityId: string,
  puedeAdministrar: boolean
) {
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const borrado = campo.entity === "contacto"
      ? await tx.delete(schema.contactCustomValue)
        .where(scoped(schema.contactCustomValue.organizationId, organizationId,
          eq(schema.contactCustomValue.fieldId, fieldId), eq(schema.contactCustomValue.contactId, entityId)))
        .returning({ id: schema.contactCustomValue.fieldId })
      : await tx.delete(schema.companyCustomValue)
        .where(scoped(schema.companyCustomValue.organizationId, organizationId,
          eq(schema.companyCustomValue.fieldId, fieldId), eq(schema.companyCustomValue.companyId, entityId)))
        .returning({ id: schema.companyCustomValue.fieldId });
    if (!borrado.length) throw new ErrorCampo(404, "not_found", "Valor no encontrado");
  });
}

export async function guardarValorCampo(
  organizationId: string,
  fieldId: string,
  entityId: string,
  valor: unknown,
  puedeAdministrar: boolean
) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.customField)
      .where(scoped(schema.customField.organizationId, organizationId, eq(schema.customField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.customField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const parseado = esquemaValorCampo({ tipo: campo.kind, opciones: campo.options }).safeParse(valor);
    if (!parseado.success) {
      throw new ErrorCampo(422, "valor_invalido", parseado.error.issues.map((i) => i.message).join("; "));
    }
    if (campo.kind === "archivo") {
      if (
        !parseado.data || typeof parseado.data !== "object" ||
        !("id" in parseado.data) || typeof parseado.data.id !== "string"
      ) {
        throw new Error("El validador de archivos devolvió un valor inválido");
      }
      const { id } = parseado.data;
      const [archivo] = await tx.select({ id: schema.customFieldFile.id }).from(schema.customFieldFile)
        .where(scoped(schema.customFieldFile.organizationId, organizationId,
          eq(schema.customFieldFile.id, id),
          eq(schema.customFieldFile.fieldId, campo.id),
          eq(schema.customFieldFile.uploadPending, false),
          eq(schema.customFieldFile.status, "activo")))
        .for("update");
      if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    }
    if (campo.entity === "contacto") {
      const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
        .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, entityId)))
        .for("update");
      if (!contacto) throw new ErrorCampo(404, "not_found", "Contacto no encontrado");
      await tx.insert(schema.contactCustomValue)
        .values({ organizationId, fieldId, contactId: entityId, value: parseado.data })
        .onConflictDoUpdate({
          target: [schema.contactCustomValue.organizationId, schema.contactCustomValue.contactId, schema.contactCustomValue.fieldId],
          set: { value: parseado.data, updatedAt: new Date() },
        });
    } else {
      const [empresa] = await tx.select({ id: schema.company.id }).from(schema.company)
        .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, entityId)))
        .for("update");
      if (!empresa) throw new ErrorCampo(404, "not_found", "Empresa no encontrada");
      await tx.insert(schema.companyCustomValue)
        .values({ organizationId, fieldId, companyId: entityId, value: parseado.data })
        .onConflictDoUpdate({
          target: [schema.companyCustomValue.organizationId, schema.companyCustomValue.companyId, schema.companyCustomValue.fieldId],
          set: { value: parseado.data, updatedAt: new Date() },
        });
    }
    return { campoId: campo.id, entidadId: entityId, valor: parseado.data };
  });
}
