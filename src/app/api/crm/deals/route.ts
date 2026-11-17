import { apiError, parseBody, withAuth } from "@/lib/api";
import { tratoSchema } from "@/lib/crm-comercial";
import { crearTrato, ErrorComercial } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, tratoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ trato: await crearTrato(session.organizationId, session.userId, body.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
