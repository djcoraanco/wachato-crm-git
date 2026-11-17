import { apiError, parseBody, withAuth } from "@/lib/api";
import { editarEtapaComercialSchema } from "@/lib/crm-comercial";
import { borrarEtapaComercial, editarEtapaComercial, ErrorComercial } from "@/server/crm-comercial";
import { atribucionDisabledResponse, atribucionEnabled } from "@/server/attribution/flag";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; stageId: string }> };
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, editarEtapaComercialSchema);
  if (!body.ok) return body.response;
  if (body.data.eventoMeta !== undefined && !atribucionEnabled()) return atribucionDisabledResponse();
  try {
    const { id, stageId } = await ctx.params;
    return Response.json({ etapa: await editarEtapaComercial(session.organizationId, id, stageId, body.data) });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    const { id, stageId } = await ctx.params;
    await borrarEtapaComercial(session.organizationId, id, stageId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
