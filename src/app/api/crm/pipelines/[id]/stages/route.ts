import { apiError, parseBody, withAuth } from "@/lib/api";
import { etapaComercialSchema } from "@/lib/crm-comercial";
import { crearEtapaComercial, ErrorComercial } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, etapaComercialSchema);
  if (!body.ok) return body.response;
  try {
    const { id } = await ctx.params;
    return Response.json({ etapa: await crearEtapaComercial(session.organizationId, id, body.data.nombre) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
