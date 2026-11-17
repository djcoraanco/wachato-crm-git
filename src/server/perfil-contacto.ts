import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { PerfilContactoInput } from "@/lib/perfil-contacto";

export class ErrorPerfil extends Error {
  constructor(readonly status: number, readonly code: string, mensaje: string) {
    super(mensaje);
  }
}

export async function leerPerfilContacto(organizationId: string, contactId: string) {
  const [contacto] = await getDb().select({ id: schema.contact.id }).from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)));
  if (!contacto) throw new ErrorPerfil(404, "not_found", "Contacto no encontrado");
  const [perfil] = await getDb().select().from(schema.contactProfile)
    .where(scoped(schema.contactProfile.organizationId, organizationId, eq(schema.contactProfile.contactId, contactId)));
  return perfil ?? null;
}

export async function guardarPerfilContacto(organizationId: string, contactId: string, datos: PerfilContactoInput) {
  return getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .for("update");
    if (!contacto) throw new ErrorPerfil(404, "not_found", "Contacto no encontrado");
    const [anterior] = await tx.select({ consents: schema.contactProfile.consents }).from(schema.contactProfile)
      .where(scoped(schema.contactProfile.organizationId, organizationId,
        eq(schema.contactProfile.contactId, contactId)));
    const cambios = {
      ...datos,
      ...(datos.consents ? { consents: { ...anterior?.consents, ...datos.consents } } : {}),
    };
    const [perfil] = await tx.insert(schema.contactProfile)
      .values({ organizationId, contactId, ...cambios })
      .onConflictDoUpdate({
        target: schema.contactProfile.contactId,
        set: { ...cambios, updatedAt: new Date() },
      }).returning();
    if (!perfil) throw new Error("No se pudo guardar el perfil");
    return perfil;
  });
}
