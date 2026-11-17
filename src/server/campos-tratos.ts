import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { definicionCampoSchema, esquemaValorCampo, type DefinicionCampo, type EdicionCampo } from "@/lib/campos-personalizados";
import { ErrorCampo } from "@/server/campos-personalizados";

function dto(campo: typeof schema.salesDealField.$inferSelect) {
  return {
    id: campo.id, entidad: "trato", clave: campo.key, nombre: campo.name,
    tipo: campo.kind, opciones: campo.options, visibilidad: campo.visibility,
  };
}

export async function listarCamposTrato(organizationId: string, puedeAdministrar: boolean) {
  const campos = await getDb().select().from(schema.salesDealField)
    .where(scoped(schema.salesDealField.organizationId, organizationId,
      puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
    .orderBy(asc(schema.salesDealField.name), asc(schema.salesDealField.id));
  return campos.map(dto);
}

export async function crearCampoTrato(organizationId: string, input: DefinicionCampo) {
  try {
    const [campo] = await getDb().insert(schema.salesDealField).values({
      id: newId("customField"), organizationId, key: input.clave, name: input.nombre,
      kind: input.tipo, options: input.opciones, visibility: input.visibilidad,
    }).returning();
    if (!campo) throw new Error("No se pudo crear el campo");
    return dto(campo);
  } catch (error) {
    const causa = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (causa && typeof causa === "object" && "code" in causa && causa.code === "23505") {
      throw new ErrorCampo(409, "duplicado", "Ya existe un campo con esa clave");
    }
    throw error;
  }
}

export async function editarCampoTrato(organizationId: string, fieldId: string, cambios: EdicionCampo) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId)))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const propuesta = definicionCampoSchema.safeParse({
      entidad: "empresa", clave: campo.key, nombre: cambios.nombre ?? campo.name,
      tipo: campo.kind, opciones: cambios.opciones ?? campo.options,
      visibilidad: cambios.visibilidad ?? campo.visibility,
    });
    if (!propuesta.success) throw new ErrorCampo(422, "definicion_invalida", propuesta.error.issues.map((i) => i.message).join("; "));
    if (cambios.opciones !== undefined) {
      const valores = await tx.select({ valor: schema.salesDealCustomValue.value }).from(schema.salesDealCustomValue)
        .where(scoped(schema.salesDealCustomValue.organizationId, organizationId,
          eq(schema.salesDealCustomValue.fieldId, fieldId)));
      const validador = esquemaValorCampo({ tipo: campo.kind, opciones: propuesta.data.opciones });
      if (valores.some(({ valor }) => !validador.safeParse(valor).success)) {
        throw new ErrorCampo(409, "opciones_en_uso", "Hay valores guardados que quedarían inválidos");
      }
    }
    const [editado] = await tx.update(schema.salesDealField)
      .set({ name: propuesta.data.nombre, options: propuesta.data.opciones,
        visibility: propuesta.data.visibilidad, updatedAt: new Date() })
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId)))
      .returning();
    if (!editado) throw new Error("No se pudo editar el campo");
    return dto(editado);
  });
}

export async function borrarCampoTrato(organizationId: string, fieldId: string) {
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId)))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const [valores, archivos] = await Promise.all([
      tx.select({ id: schema.salesDealCustomValue.fieldId }).from(schema.salesDealCustomValue)
        .where(scoped(schema.salesDealCustomValue.organizationId, organizationId, eq(schema.salesDealCustomValue.fieldId, fieldId))).limit(1),
      tx.select({ id: schema.salesDealFieldFile.fileId }).from(schema.salesDealFieldFile)
        .where(scoped(schema.salesDealFieldFile.organizationId, organizationId, eq(schema.salesDealFieldFile.fieldId, fieldId))).limit(1),
    ]);
    if (valores.length || archivos.length) throw new ErrorCampo(409, "campo_en_uso", "El campo tiene valores o archivos");
    await tx.delete(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId)));
  });
}

export async function leerValoresTrato(organizationId: string, fieldId: string, puedeAdministrar: boolean) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("share");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    return tx.select({ entidadId: schema.salesDealCustomValue.dealId, valor: schema.salesDealCustomValue.value })
      .from(schema.salesDealCustomValue)
      .where(scoped(schema.salesDealCustomValue.organizationId, organizationId, eq(schema.salesDealCustomValue.fieldId, fieldId)));
  });
}

export async function guardarValorTrato(
  organizationId: string, fieldId: string, dealId: string, valor: unknown, puedeAdministrar: boolean
) {
  return getDb().transaction(async (tx) => {
    const [campo] = await tx.select().from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const parsed = esquemaValorCampo({ tipo: campo.kind, opciones: campo.options }).safeParse(valor);
    if (!parsed.success) throw new ErrorCampo(422, "valor_invalido", parsed.error.issues.map((i) => i.message).join("; "));
    if (campo.kind === "archivo") {
      if (!parsed.data || typeof parsed.data !== "object" || !("id" in parsed.data) || typeof parsed.data.id !== "string") {
        throw new Error("El validador de archivos devolvió un valor inválido");
      }
      const [archivo] = await tx.select({ id: schema.customFieldFile.id }).from(schema.customFieldFile)
        .innerJoin(schema.salesDealFieldFile, eq(schema.salesDealFieldFile.fileId, schema.customFieldFile.id))
        .where(scoped(schema.customFieldFile.organizationId, organizationId,
          eq(schema.customFieldFile.id, parsed.data.id), eq(schema.salesDealFieldFile.organizationId, organizationId),
          eq(schema.salesDealFieldFile.fieldId, fieldId), eq(schema.customFieldFile.status, "activo"),
          eq(schema.customFieldFile.uploadPending, false)))
        .for("update");
      if (!archivo) throw new ErrorCampo(404, "not_found", "Archivo no encontrado");
    }
    const [trato] = await tx.select({ id: schema.salesDeal.id }).from(schema.salesDeal)
      .where(scoped(schema.salesDeal.organizationId, organizationId, eq(schema.salesDeal.id, dealId)))
      .for("update");
    if (!trato) throw new ErrorCampo(404, "not_found", "Trato no encontrado");
    await tx.insert(schema.salesDealCustomValue).values({ organizationId, fieldId, dealId, value: parsed.data })
      .onConflictDoUpdate({
        target: [schema.salesDealCustomValue.organizationId, schema.salesDealCustomValue.dealId, schema.salesDealCustomValue.fieldId],
        set: { value: parsed.data, updatedAt: new Date() },
      });
    return { campoId: fieldId, entidadId: dealId, valor: parsed.data };
  });
}

export async function borrarValorTrato(
  organizationId: string, fieldId: string, dealId: string, puedeAdministrar: boolean
) {
  await getDb().transaction(async (tx) => {
    const [campo] = await tx.select({ id: schema.salesDealField.id }).from(schema.salesDealField)
      .where(scoped(schema.salesDealField.organizationId, organizationId, eq(schema.salesDealField.id, fieldId),
        puedeAdministrar ? undefined : eq(schema.salesDealField.visibility, "equipo")))
      .for("update");
    if (!campo) throw new ErrorCampo(404, "not_found", "Campo no encontrado");
    const borrado = await tx.delete(schema.salesDealCustomValue)
      .where(scoped(schema.salesDealCustomValue.organizationId, organizationId,
        eq(schema.salesDealCustomValue.fieldId, fieldId), eq(schema.salesDealCustomValue.dealId, dealId)))
      .returning({ id: schema.salesDealCustomValue.fieldId });
    if (!borrado.length) throw new ErrorCampo(404, "not_found", "Valor no encontrado");
  });
}
