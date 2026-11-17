import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { atribucionEnabled } from "@/server/attribution/flag";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));
  return Response.json({ stages: stages.map(({ metaEvent, ...stage }) =>
    atribucionEnabled() ? { ...stage, metaEvent } : stage) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const maxPos = await db
    .select({
      max: sql<number>`coalesce(max(${schema.pipelineStage.position}), -1)`,
    })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId));

  const inserted = await db
    .insert(schema.pipelineStage)
    .values({
      id: newId("stage"),
      organizationId: session.organizationId,
      name: body.data.name,
      position: (maxPos[0]?.max ?? -1) + 1,
      kind: "open",
    })
    .returning();
  const stage = inserted[0];
  if (!stage) throw new Error("No se pudo crear la etapa");
  const { metaEvent, ...datos } = stage;
  return Response.json({ stage: atribucionEnabled() ? { ...datos, metaEvent } : datos }, { status: 201 });
});
