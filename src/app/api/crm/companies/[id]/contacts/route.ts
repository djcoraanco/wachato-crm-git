import { apiError, parseBody, withAuth } from "@/lib/api";
import { vinculoEmpresaSchema } from "@/lib/empresas";
import { desvincularContactoEmpresa, ErrorEmpresa, vincularContactoEmpresa } from "@/server/empresas";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, vinculoEmpresaSchema);
  if (!body.ok) return body.response;
  try {
    await vincularContactoEmpresa(session.organizationId, (await ctx.params).id, body.data.contactId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, vinculoEmpresaSchema);
  if (!body.ok) return body.response;
  try {
    await desvincularContactoEmpresa(session.organizationId, (await ctx.params).id, body.data.contactId);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
