import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { ErrorCampo } from "@/server/campos-personalizados";
import { borrarValorTrato, guardarValorTrato, leerValoresTrato } from "@/server/campos-tratos";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const valorSchema = z.object({ entidadId: z.string().min(1).max(100), valor: z.unknown() }).strict()
  .refine((body) => Object.prototype.hasOwnProperty.call(body, "valor"), "Falta el valor");
const borrarSchema = z.object({ entidadId: z.string().min(1).max(100) }).strict();
export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const ids = new URL(req.url).searchParams.getAll("entidadId");
  const entidadId = z.string().min(1).max(100).safeParse(ids.length === 1 ? ids[0] : null);
  if (!entidadId.success) return apiError(422, "invalid_entity_id", "Indica un trato válido");
  try {
    return Response.json({ valores: await leerValoresTrato(
      session.organizationId, (await ctx.params).id, entidadId.data, canConfigure(session.role)
    ) });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, valorSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json(await guardarValorTrato(session.organizationId, (await ctx.params).id,
      body.data.entidadId, body.data.valor, canConfigure(session.role)));
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, borrarSchema);
  if (!body.ok) return body.response;
  try {
    await borrarValorTrato(session.organizationId, (await ctx.params).id, body.data.entidadId, canConfigure(session.role));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
