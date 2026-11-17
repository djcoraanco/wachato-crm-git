import { apiError, parseBody, withAuth } from "@/lib/api";
import { embudoSchema } from "@/lib/crm-comercial";
import { crearEmbudo, ErrorComercial, listarEmbudos } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) =>
  Response.json({ embudos: await listarEmbudos(session.organizationId) })
);

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, embudoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ embudo: await crearEmbudo(session.organizationId, body.data.nombre) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
