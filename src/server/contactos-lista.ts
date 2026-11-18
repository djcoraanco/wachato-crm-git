import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { digitsOnly, normalizeText } from "@/lib/search";

const filtrosSchema = z.object({
  q: z.string().trim().max(200).optional(),
  stage: z.string().trim().max(200).optional(),
  channel: z.enum(["whatsapp", "instagram", "messenger", "tiktok"]).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

export function leerFiltrosContactos(params: URLSearchParams) {
  return filtrosSchema.safeParse({
    q: params.get("q") || undefined,
    stage: params.get("stage") || undefined,
    channel: params.get("channel") || undefined,
    tag: params.get("tag") || undefined,
    archived: params.get("archived") || undefined,
  });
}

type Filtros = z.infer<typeof filtrosSchema>;
const FROM = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
const TO = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

export async function listarContactos(organizationId: string, filtros: Filtros, offset?: number) {
  const db = getDb();
  const q = filtros.q;
  const digits = q ? digitsOnly(q) : "";
  const like = q ? normalizeText(q).replace(/[\\%_]/g, "\\$&") : "";
  const search = q
    ? or(
        sql`lower(translate(${schema.contact.name}, ${FROM}, ${TO})) like ${`%${like}%`}`,
        sql`lower(translate(${schema.contact.waIdentity}, ${FROM}, ${TO})) like ${`%${like}%`}`,
        sql`exists (select 1 from jsonb_array_elements_text(${schema.contact.tags}) as etiqueta(valor)
          where lower(translate(etiqueta.valor, ${FROM}, ${TO})) like ${`%${like}%`})`,
        digits.length >= 3
          ? sql`regexp_replace(coalesce(${schema.contact.phone}, ''), '\\D', '', 'g') like ${`%${digits}%`}`
          : undefined
      )
    : undefined;
  const condition = scoped(
    schema.contact.organizationId,
    organizationId,
    filtros.archived === "true" ? undefined : isNull(schema.contact.archivedAt),
    filtros.channel ? eq(schema.contact.channel, filtros.channel) : undefined,
    filtros.tag ? sql`${schema.contact.tags} @> ${JSON.stringify([filtros.tag])}::jsonb` : undefined,
    filtros.stage ? eq(schema.pipelineStage.name, filtros.stage) : undefined,
    search
  );
  const consulta = db
    .select({
      contact: schema.contact,
      avatarId: schema.contactAvatar.id,
      stageName: schema.pipelineStage.name,
      priority: schema.lead.priority,
      amountCents: schema.lead.amountCents,
      currency: schema.lead.currency,
      lastMessageAt: schema.conversation.lastMessageAt,
      origen: { id: schema.adAttribution.id, sourceType: schema.adAttribution.sourceType },
    })
    .from(schema.contact)
    .leftJoin(schema.contactAvatar, and(
      eq(schema.contactAvatar.contactId, schema.contact.id),
      eq(schema.contactAvatar.organizationId, schema.contact.organizationId),
      eq(schema.contactAvatar.status, "activo")
    ))
    .leftJoin(schema.lead, and(
      eq(schema.lead.contactId, schema.contact.id),
      eq(schema.lead.organizationId, schema.contact.organizationId)
    ))
    .leftJoin(schema.pipelineStage, and(
      eq(schema.pipelineStage.id, schema.lead.stageId),
      eq(schema.pipelineStage.organizationId, schema.contact.organizationId)
    ))
    .leftJoin(schema.conversation, and(
      eq(schema.conversation.contactId, schema.contact.id),
      eq(schema.conversation.organizationId, schema.contact.organizationId),
      eq(schema.conversation.isTest, false)
    ))
    .leftJoin(schema.adAttribution, and(
      eq(schema.adAttribution.conversationId, schema.conversation.id),
      eq(schema.adAttribution.organizationId, schema.contact.organizationId)
    ))
    .where(condition)
    .orderBy(desc(schema.contact.updatedAt), desc(schema.contact.id));
  return offset === undefined ? consulta : consulta.limit(200).offset(offset);
}
