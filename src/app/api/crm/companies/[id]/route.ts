import { apiError, parseBody, withAuth } from "@/lib/api";
import { editarEmpresaSchema } from "@/lib/empresas";
import { borrarEmpresa, ErrorEmpresa, guardarEmpresa, obtenerEmpresa } from "@/server/empresas";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    return Response.json({ empresa: await obtenerEmpresa(session.organizationId, (await ctx.params).id) });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, editarEmpresaSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ empresa: await guardarEmpresa(session.organizationId, (await ctx.params).id, body.data) });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    await borrarEmpresa(session.organizationId, (await ctx.params).id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
