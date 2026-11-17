import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { ActividadInput, EditarEtapaComercial, EditarTrato, TratoInput } from "@/lib/crm-comercial";
import { reportDealStageEvent } from "@/server/attribution/conversions";
import { atribucionEnabled } from "@/server/attribution/flag";

export const EMBUDO_PREDETERMINADO = "predeterminado";

export class ErrorComercial extends Error {
  constructor(readonly status: number, readonly code: string, mensaje: string) {
    super(mensaje);
  }
}

export async function listarEmbudos(organizationId: string) {
  const filas = await getDb().select().from(schema.salesPipeline)
    .where(scoped(schema.salesPipeline.organizationId, organizationId))
    .orderBy(asc(schema.salesPipeline.name));
  return [
    { id: EMBUDO_PREDETERMINADO, nombre: "Principal", predeterminado: true },
    ...filas.map((fila) => ({ id: fila.id, nombre: fila.name, predeterminado: false })),
  ];
}

export async function crearEmbudo(organizationId: string, nombre: string) {
  try {
    return await getDb().transaction(async (tx) => {
      const [embudo] = await tx.insert(schema.salesPipeline)
        .values({ id: newId("salesPipeline"), organizationId, name: nombre }).returning();
      if (!embudo) throw new Error("No se pudo crear el embudo");
      await tx.insert(schema.salesPipelineStage).values({
        id: newId("salesPipelineStage"), organizationId, pipelineId: embudo.id,
        name: "Nuevo", position: 0,
      });
      return { id: embudo.id, nombre: embudo.name, predeterminado: false };
    });
  } catch (error) {
    const causa = error && typeof error === "object" && "cause" in error ? error.cause : error;
    if (causa && typeof causa === "object" && "code" in causa && causa.code === "23505") {
      throw new ErrorComercial(409, "duplicado", "Ya existe un embudo con ese nombre");
    }
    throw error;
  }
}

export async function crearEtapaComercial(organizationId: string, embudoId: string, nombre: string) {
  return getDb().transaction(async (tx) => {
    const [embudo] = await tx.select({ id: schema.salesPipeline.id }).from(schema.salesPipeline)
      .where(scoped(schema.salesPipeline.organizationId, organizationId, eq(schema.salesPipeline.id, embudoId)))
      .for("update");
    if (!embudo) throw new ErrorComercial(404, "not_found", "Embudo no encontrado");
    const [pos] = await tx.select({ max: sql<number>`coalesce(max(${schema.salesPipelineStage.position}), -1)` })
      .from(schema.salesPipelineStage)
      .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
        eq(schema.salesPipelineStage.pipelineId, embudoId)));
    const [etapa] = await tx.insert(schema.salesPipelineStage).values({
      id: newId("salesPipelineStage"), organizationId, pipelineId: embudoId,
      name: nombre, position: (pos?.max ?? -1) + 1,
    }).returning();
    if (!etapa) throw new Error("No se pudo crear la etapa");
    return { id: etapa.id, nombre: etapa.name, posicion: etapa.position };
  });
}

export async function editarEtapaComercial(organizationId: string, embudoId: string, etapaId: string, input: EditarEtapaComercial) {
  const [etapa] = await getDb().update(schema.salesPipelineStage)
    .set({
      ...(input.nombre !== undefined ? { name: input.nombre } : {}),
      ...(input.posicion !== undefined ? { position: input.posicion } : {}),
      ...(input.eventoMeta !== undefined ? { metaEvent: input.eventoMeta } : {}),
    })
    .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
      eq(schema.salesPipelineStage.pipelineId, embudoId), eq(schema.salesPipelineStage.id, etapaId)))
    .returning();
  if (!etapa) throw new ErrorComercial(404, "not_found", "Etapa no encontrada");
  return { id: etapa.id, nombre: etapa.name, posicion: etapa.position,
    ...(atribucionEnabled() ? { eventoMeta: etapa.metaEvent } : {}) };
}

export async function borrarEtapaComercial(organizationId: string, embudoId: string, etapaId: string) {
  await getDb().transaction(async (tx) => {
    const [embudo] = await tx.select({ id: schema.salesPipeline.id }).from(schema.salesPipeline)
      .where(scoped(schema.salesPipeline.organizationId, organizationId, eq(schema.salesPipeline.id, embudoId)))
      .for("update");
    if (!embudo) throw new ErrorComercial(404, "not_found", "Embudo no encontrado");
    const etapas = await tx.select({ id: schema.salesPipelineStage.id }).from(schema.salesPipelineStage)
      .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
        eq(schema.salesPipelineStage.pipelineId, embudoId)))
      .orderBy(asc(schema.salesPipelineStage.id)).for("update");
    if (!etapas.some((etapa) => etapa.id === etapaId)) throw new ErrorComercial(404, "not_found", "Etapa no encontrada");
    if (etapas.length === 1) throw new ErrorComercial(409, "ultima_etapa", "El embudo necesita al menos una etapa");
    const [trato] = await tx.select({ id: schema.salesDeal.id }).from(schema.salesDeal)
      .where(scoped(schema.salesDeal.organizationId, organizationId,
        eq(schema.salesDeal.pipelineId, embudoId), eq(schema.salesDeal.stageId, etapaId))).limit(1);
    if (trato) throw new ErrorComercial(409, "stage_has_deals", "Mueve primero los tratos de esta etapa");
    await tx.delete(schema.salesPipelineStage)
      .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
        eq(schema.salesPipelineStage.pipelineId, embudoId), eq(schema.salesPipelineStage.id, etapaId)));
  });
}

export async function tableroComercial(organizationId: string, embudoId: string) {
  const db = getDb();
  const principal = embudoId === EMBUDO_PREDETERMINADO;
  if (!principal) {
    const [embudo] = await db.select({ id: schema.salesPipeline.id }).from(schema.salesPipeline)
      .where(scoped(schema.salesPipeline.organizationId, organizationId, eq(schema.salesPipeline.id, embudoId)));
    if (!embudo) throw new ErrorComercial(404, "not_found", "Embudo no encontrado");
  }
  const etapas = principal
    ? await db.select({ id: schema.pipelineStage.id, nombre: schema.pipelineStage.name, posicion: schema.pipelineStage.position, eventoMeta: schema.pipelineStage.metaEvent })
      .from(schema.pipelineStage).where(scoped(schema.pipelineStage.organizationId, organizationId))
      .orderBy(asc(schema.pipelineStage.position))
    : await db.select({ id: schema.salesPipelineStage.id, nombre: schema.salesPipelineStage.name, posicion: schema.salesPipelineStage.position, eventoMeta: schema.salesPipelineStage.metaEvent })
      .from(schema.salesPipelineStage).where(scoped(schema.salesPipelineStage.organizationId, organizationId,
        eq(schema.salesPipelineStage.pipelineId, embudoId))).orderBy(asc(schema.salesPipelineStage.position));
  const tratos = await db.select({ trato: schema.salesDeal, contacto: { id: schema.contact.id, nombre: schema.contact.name } })
    .from(schema.salesDeal)
    .innerJoin(schema.contact, eq(schema.salesDeal.contactId, schema.contact.id))
    .where(scoped(schema.salesDeal.organizationId, organizationId,
      principal ? sql`${schema.salesDeal.pipelineId} is null` : eq(schema.salesDeal.pipelineId, embudoId)))
    .orderBy(asc(schema.salesDeal.position), asc(schema.salesDeal.createdAt));
  return {
    etapas: etapas.map((etapa) => ({
      ...etapa,
      eventoMeta: atribucionEnabled() ? etapa.eventoMeta : null,
    })),
    tratos: tratos.map(({ trato, contacto }) => ({
      id: trato.id, titulo: trato.title, contacto, etapaId: trato.stageId ?? trato.legacyStageId,
      monto: trato.amountCents === null ? null : { centavos: trato.amountCents, moneda: trato.currency },
    })),
  };
}

export async function crearTrato(organizationId: string, userId: string, input: TratoInput) {
  const resultado = await getDb().transaction(async (tx) => {
    const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, input.contactoId)))
      .for("key share");
    if (!contacto) throw new ErrorComercial(404, "not_found", "Contacto no encontrado");
    const principal = input.embudoId === EMBUDO_PREDETERMINADO;
    const [etapa] = principal
      ? await tx.select({ id: schema.pipelineStage.id, metaEvent: schema.pipelineStage.metaEvent }).from(schema.pipelineStage)
        .where(scoped(schema.pipelineStage.organizationId, organizationId, eq(schema.pipelineStage.id, input.etapaId)))
        .for("key share")
      : await tx.select({ id: schema.salesPipelineStage.id, metaEvent: schema.salesPipelineStage.metaEvent }).from(schema.salesPipelineStage)
        .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
          eq(schema.salesPipelineStage.pipelineId, input.embudoId), eq(schema.salesPipelineStage.id, input.etapaId)))
        .for("key share");
    if (!etapa) throw new ErrorComercial(422, "invalid_stage", "Etapa inválida para el embudo");
    const [trato] = await tx.insert(schema.salesDeal).values({
      id: newId("salesDeal"), organizationId, contactId: contacto.id,
      pipelineId: principal ? null : input.embudoId, stageId: principal ? null : etapa.id,
      legacyStageId: principal ? etapa.id : null, title: input.titulo,
      amountCents: input.monto?.centavos ?? null, currency: input.monto?.moneda ?? null,
    }).returning();
    if (!trato) throw new Error("No se pudo crear el trato");
    await tx.insert(schema.salesDealEvent).values({
      id: newId("salesDealEvent"), organizationId, dealId: trato.id,
      toStage: etapa.id, actorUserId: userId,
    });
    return { id: trato.id, contactId: trato.contactId, eventName: etapa.metaEvent,
      amountCents: trato.amountCents, currency: trato.currency };
  });
  await reportDealStageEvent({ organizationId, ...resultado });
  return { id: resultado.id };
}

export async function editarTrato(organizationId: string, userId: string, id: string, input: EditarTrato) {
  const resultado = await getDb().transaction(async (tx) => {
    const [trato] = await tx.select().from(schema.salesDeal)
      .where(scoped(schema.salesDeal.organizationId, organizationId, eq(schema.salesDeal.id, id)))
      .for("update");
    if (!trato) throw new ErrorComercial(404, "not_found", "Trato no encontrado");
    let eventName: string | null = null;
    if (input.etapaId) {
      const [etapa] = trato.pipelineId === null
        ? await tx.select({ id: schema.pipelineStage.id, metaEvent: schema.pipelineStage.metaEvent }).from(schema.pipelineStage)
          .where(scoped(schema.pipelineStage.organizationId, organizationId, eq(schema.pipelineStage.id, input.etapaId)))
          .for("key share")
        : await tx.select({ id: schema.salesPipelineStage.id, metaEvent: schema.salesPipelineStage.metaEvent }).from(schema.salesPipelineStage)
          .where(scoped(schema.salesPipelineStage.organizationId, organizationId,
            eq(schema.salesPipelineStage.pipelineId, trato.pipelineId), eq(schema.salesPipelineStage.id, input.etapaId)))
          .for("key share");
      if (!etapa) throw new ErrorComercial(422, "invalid_stage", "Etapa inválida para el embudo");
      const anterior = trato.stageId ?? trato.legacyStageId;
      if (anterior !== etapa.id) {
        eventName = etapa.metaEvent;
        await tx.insert(schema.salesDealEvent).values({
          id: newId("salesDealEvent"), organizationId, dealId: id,
          fromStage: anterior, toStage: etapa.id, actorUserId: userId,
        });
      }
    }
    await tx.update(schema.salesDeal).set({
      ...(input.titulo !== undefined ? { title: input.titulo } : {}),
      ...(input.etapaId !== undefined
        ? trato.pipelineId === null ? { legacyStageId: input.etapaId } : { stageId: input.etapaId }
        : {}),
      ...(input.monto !== undefined
        ? { amountCents: input.monto?.centavos ?? null, currency: input.monto?.moneda ?? null }
        : {}),
      updatedAt: new Date(),
    }).where(scoped(schema.salesDeal.organizationId, organizationId, eq(schema.salesDeal.id, id)));
    return { id, contactId: trato.contactId, eventName,
      amountCents: input.monto === undefined ? trato.amountCents : input.monto?.centavos ?? null,
      currency: input.monto === undefined ? trato.currency : input.monto?.moneda ?? null };
  });
  await reportDealStageEvent({ organizationId, ...resultado });
  return { id: resultado.id };
}

export async function crearActividad(organizationId: string, input: ActividadInput) {
  return getDb().transaction(async (tx) => {
    let contactoAsociado: string | null = null;
    if (input.tratoId) {
      const [trato] = await tx.select({ contactId: schema.salesDeal.contactId }).from(schema.salesDeal)
        .where(scoped(schema.salesDeal.organizationId, organizationId, eq(schema.salesDeal.id, input.tratoId)))
        .for("key share");
      if (!trato) throw new ErrorComercial(404, "not_found", "Trato no encontrado");
      contactoAsociado = trato.contactId;
    }
    if (input.leadId) {
      const [lead] = await tx.select({ contactId: schema.lead.contactId }).from(schema.lead)
        .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, input.leadId)))
        .for("key share");
      if (!lead) throw new ErrorComercial(404, "not_found", "Lead no encontrado");
      if (contactoAsociado && contactoAsociado !== lead.contactId) {
        throw new ErrorComercial(422, "invalid_contact", "Los vínculos pertenecen a contactos distintos");
      }
      contactoAsociado = lead.contactId;
    }
    if (input.contactoId) {
      const [contacto] = await tx.select({ id: schema.contact.id }).from(schema.contact)
        .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, input.contactoId)))
        .for("key share");
      if (!contacto) throw new ErrorComercial(404, "not_found", "Contacto no encontrado");
      if (contactoAsociado && contactoAsociado !== contacto.id) {
        throw new ErrorComercial(422, "invalid_contact", "Los vínculos pertenecen a contactos distintos");
      }
    }
    const [actividad] = await tx.insert(schema.crmActivity).values({
      id: newId("crmActivity"), organizationId, contactId: input.contactoId ?? contactoAsociado,
      leadId: input.leadId ?? null, dealId: input.tratoId ?? null,
      kind: input.tipo, content: input.contenido, dueAt: input.vence ? new Date(input.vence) : null,
    }).returning();
    if (!actividad) throw new Error("No se pudo guardar la actividad");
    return { id: actividad.id };
  });
}

export async function listarActividades(organizationId: string, contactoId: string) {
  return getDb().select().from(schema.crmActivity)
    .where(scoped(schema.crmActivity.organizationId, organizationId, eq(schema.crmActivity.contactId, contactoId)))
    .orderBy(asc(schema.crmActivity.createdAt));
}
