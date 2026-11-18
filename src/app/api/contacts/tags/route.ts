import { sql } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const rows = await getDb()
    .selectDistinct({ tag: sql<string>`jsonb_array_elements_text(${schema.contact.tags})` })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, session.organizationId, sql`jsonb_array_length(${schema.contact.tags}) > 0`));
  const etiquetas = rows.map((row) => row.tag).sort((a, b) => a.localeCompare(b, "es"));
  return Response.json({ etiquetas });
});
