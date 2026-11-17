import { apiError, withAuth } from "@/lib/api";
import { ErrorComercial, tableroComercial } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    const { id } = await ctx.params;
    return Response.json(await tableroComercial(session.organizationId, id));
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
