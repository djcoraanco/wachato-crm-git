import { apiError, parseBody, withAuth } from "@/lib/api";
import { perfilContactoSchema } from "@/lib/perfil-contacto";
import { ErrorPerfil, guardarPerfilContacto, leerPerfilContacto } from "@/server/perfil-contacto";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    return Response.json({ perfil: await leerPerfilContacto(session.organizationId, (await ctx.params).id) });
  } catch (error) {
    if (error instanceof ErrorPerfil) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, perfilContactoSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ perfil: await guardarPerfilContacto(session.organizationId, (await ctx.params).id, body.data) });
  } catch (error) {
    if (error instanceof ErrorPerfil) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
