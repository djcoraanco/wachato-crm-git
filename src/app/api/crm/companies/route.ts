import { apiError, parseBody, withAuth } from "@/lib/api";
import { empresaSchema } from "@/lib/empresas";
import { ErrorEmpresa, guardarEmpresa, listarEmpresas } from "@/server/empresas";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) =>
  Response.json({ empresas: await listarEmpresas(session.organizationId) })
);

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, empresaSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ empresa: await guardarEmpresa(session.organizationId, null, body.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorEmpresa) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
