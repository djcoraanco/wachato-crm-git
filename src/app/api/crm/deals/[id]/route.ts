import { apiError, parseBody, withAuth } from "@/lib/api";
import { editarTratoSchema } from "@/lib/crm-comercial";
import { editarTrato, ErrorComercial } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, editarTratoSchema);
  if (!body.ok) return body.response;
  try {
    const { id } = await ctx.params;
    return Response.json({ trato: await editarTrato(session.organizationId, session.userId, id, body.data) });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
