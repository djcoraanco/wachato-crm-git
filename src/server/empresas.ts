import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { EditarEmpresa, EmpresaInput } from "@/lib/empresas";

export class ErrorEmpresa extends Error {
  constructor(readonly status: number, readonly code: string, mensaje: string) {
    super(mensaje);
  }
}

export async function listarEmpresas(organizationId: string) {
  return getDb().select().from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId))
    .orderBy(asc(schema.company.name), asc(schema.company.id));
}

export async function guardarEmpresa(organizationId: string, id: string | null, input: EmpresaInput | EditarEmpresa) {
  return getDb().transaction(async (tx) => {
    await tx.select({ id: schema.organization.id }).from(schema.organization)
      .where(eq(schema.organization.id, organizationId)).for("update");
    const empresas = await tx.select().from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId));
    const actual = id ? empresas.find((empresa) => empresa.id === id) : undefined;
    if (id && !actual) throw new ErrorEmpresa(404, "not_found", "Empresa no encontrada");
    if (input.parentCompanyId) {
      const porId = new Map(empresas.map((empresa) => [empresa.id, empresa]));
      let siguiente: string | null = input.parentCompanyId;
      const visitadas = new Set<string>();
      while (siguiente) {
        if (siguiente === id || visitadas.has(siguiente)) {
          throw new ErrorEmpresa(422, "ciclo_matriz", "La matriz no puede formar un ciclo");
        }
        visitadas.add(siguiente);
        const matriz = porId.get(siguiente);
        if (!matriz) throw new ErrorEmpresa(422, "matriz_invalida", "La matriz no pertenece a este negocio");
        siguiente = matriz.parentCompanyId;
      }
    }
    if (id) {
      const [editada] = await tx.update(schema.company).set({ ...input, updatedAt: new Date() })
        .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, id)))
        .returning();
      if (!editada) throw new Error("No se pudo editar la empresa");
      return editada;
    }
    if (!input.name) throw new ErrorEmpresa(422, "nombre_requerido", "Indica el nombre de la empresa");
    const [creada] = await tx.insert(schema.company).values({
      ...input, name: input.name, id: newId("company"), organizationId,
    }).returning();
    if (!creada) throw new Error("No se pudo crear la empresa");
    return creada;
  });
}

export async function obtenerEmpresa(organizationId: string, id: string) {
  const [empresa] = await getDb().select().from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, id)));
  if (!empresa) throw new ErrorEmpresa(404, "not_found", "Empresa no encontrada");
  const contactos = await getDb().select({
    id: schema.contact.id, name: schema.contact.name, phone: schema.contact.phone,
  }).from(schema.companyContact).innerJoin(schema.contact,
    eq(schema.companyContact.contactId, schema.contact.id))
    .where(scoped(schema.companyContact.organizationId, organizationId,
      eq(schema.companyContact.companyId, id)));
  return { ...empresa, contactos };
}

export async function vincularContactoEmpresa(organizationId: string, companyId: string, contactId: string) {
  await getDb().transaction(async (tx) => {
    const [empresa] = await tx.select({ id: schema.company.id }).from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
      .for("key share");
    if (!empresa) throw new ErrorEmpresa(404, "not_found", "Empresa no encontrada");
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("key share");
    if (!contacto) throw new ErrorEmpresa(404, "not_found", "Contacto no encontrado");
    await tx.insert(schema.companyContact).values({ organizationId, companyId, contactId })
      .onConflictDoNothing();
  });
}

export async function desvincularContactoEmpresa(organizationId: string, companyId: string, contactId: string) {
  const borrados = await getDb().delete(schema.companyContact)
    .where(scoped(schema.companyContact.organizationId, organizationId,
      eq(schema.companyContact.companyId, companyId), eq(schema.companyContact.contactId, contactId)))
    .returning({ id: schema.companyContact.contactId });
  if (!borrados.length) throw new ErrorEmpresa(404, "not_found", "Vínculo no encontrado");
}

export async function borrarEmpresa(organizationId: string, id: string) {
  await getDb().transaction(async (tx) => {
    await tx.select({ id: schema.organization.id }).from(schema.organization)
      .where(eq(schema.organization.id, organizationId)).for("update");
    const [empresa] = await tx.select({ id: schema.company.id }).from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, id)))
      .for("update");
    if (!empresa) throw new ErrorEmpresa(404, "not_found", "Empresa no encontrada");
    const [sucursales, contactos, valores] = await Promise.all([
      tx.select({ id: schema.company.id }).from(schema.company)
        .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.parentCompanyId, id))).limit(1),
      tx.select({ id: schema.companyContact.contactId }).from(schema.companyContact)
        .where(scoped(schema.companyContact.organizationId, organizationId, eq(schema.companyContact.companyId, id))).limit(1),
      tx.select({ id: schema.companyCustomValue.fieldId }).from(schema.companyCustomValue)
        .where(scoped(schema.companyCustomValue.organizationId, organizationId, eq(schema.companyCustomValue.companyId, id))).limit(1),
    ]);
    if (sucursales.length || contactos.length || valores.length) {
      throw new ErrorEmpresa(409, "empresa_en_uso", "La empresa tiene sucursales, contactos o campos personalizados");
    }
    await tx.delete(schema.company)
      .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, id)));
  });
}
