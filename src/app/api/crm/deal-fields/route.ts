import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { definicionCampoTratoSchema } from "@/lib/campos-personalizados";
import { ErrorCampo } from "@/server/campos-personalizados";
import { crearCampoTrato, listarCamposTrato } from "@/server/campos-tratos";

export const dynamic = "force-dynamic";
export const GET = withAuth(async (session) =>
  Response.json({ campos: await listarCamposTrato(session.organizationId, canConfigure(session.role)) })
);
export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "No tienes permiso para gestionar campos");
  const body = await parseBody(req, definicionCampoTratoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ campo: await crearCampoTrato(session.organizationId, body.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
