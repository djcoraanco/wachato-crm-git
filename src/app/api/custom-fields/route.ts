import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { definicionCampoSchema } from "@/lib/campos-personalizados";
import { crearCampo, ErrorCampo, listarCampos } from "@/server/campos-personalizados";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  return Response.json({ campos: await listarCampos(session.organizationId, canConfigure(session.role)) });
});

export const POST = withAuth(async (session, req: Request) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "No tienes permiso para gestionar campos");
  const body = await parseBody(req, definicionCampoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({
      campo: await crearCampo(session.organizationId, {
        ...body.data,
        opciones: body.data.opciones ?? [],
        visibilidad: body.data.visibilidad ?? "privado",
      }),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
