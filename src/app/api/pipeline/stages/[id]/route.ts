import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { META_BUSINESS_MESSAGING_EVENTS } from "@/lib/meta/capi";
import { atribucionEnabled, atribucionDisabledResponse } from "@/server/attribution/flag";
import { eliminarEtapaConLeads } from "@/server/leads/stage-history";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  position: z.number().int().min(0).optional(),
  metaEvent: z.enum(META_BUSINESS_MESSAGING_EVENTS).nullable().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  if (body.data.metaEvent !== undefined && !atribucionEnabled()) {
    return atribucionDisabledResponse();
  }

  const db = getDb();
  const updated = await db
    .update(schema.pipelineStage)
    .set({
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.position !== undefined
        ? { position: body.data.position }
        : {}),
      ...(body.data.metaEvent !== undefined ? { metaEvent: body.data.metaEvent } : {}),
    })
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        eq(schema.pipelineStage.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Etapa no encontrada");
  const { metaEvent, ...stage } = updated[0];
  return Response.json({ stage: atribucionEnabled() ? { ...stage, metaEvent } : stage });
});

export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const moveTo = url.searchParams.get("moveTo");
  const result = await eliminarEtapaConLeads({
    organizationId: session.organizationId, stageId: id, moveTo, actorUserId: session.userId,
  });
  if (!result.ok) {
    switch (result.reason) {
      case "not_found": return apiError(404, "not_found", "Etapa no encontrada");
      case "anchor_stage": return apiError(409, "anchor_stage", 'Las etapas ancla ("ganado" y "perdido") no se pueden eliminar');
      case "stage_has_deals": return apiError(409, "stage_has_deals", "Mueve primero los tratos de esta etapa");
      case "stage_has_leads": return apiError(409, "stage_has_leads", "La etapa tiene tarjetas: indica ?moveTo=<etapa destino> para reasignarlas");
      case "invalid_move_to": return apiError(422, "invalid_move_to", "Etapa destino inválida");
    }
  }
  return Response.json({ deleted: true, movedLeads: result.movedLeads });
});
