import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { edicionCampoSchema } from "@/lib/campos-personalizados";
import { borrarCampo, editarCampo, ErrorCampo } from "@/server/campos-personalizados";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "No tienes permiso para gestionar campos");
  const body = await parseBody(req, edicionCampoSchema);
  if (!body.ok) return body.response;
  try {
    const { id } = await ctx.params;
    return Response.json({ campo: await editarCampo(session.organizationId, id, body.data) });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (!canConfigure(session.role)) return apiError(403, "forbidden", "No tienes permiso para gestionar campos");
  try {
    const { id } = await ctx.params;
    await borrarCampo(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
