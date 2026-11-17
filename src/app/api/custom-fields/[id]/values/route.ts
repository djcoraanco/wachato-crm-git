import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarValorCampo, ErrorCampo, guardarValorCampo, leerValoresCampo } from "@/server/campos-personalizados";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const cuerpoSchema = z.object({
  entidadId: z.string().min(1).max(100),
  valor: z.unknown(),
}).strict().refine((body) => Object.prototype.hasOwnProperty.call(body, "valor"), {
  message: "Falta el valor",
});
const borrarSchema = z.object({ entidadId: z.string().min(1).max(100) }).strict();

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    const { id } = await ctx.params;
    return Response.json({ valores: await leerValoresCampo(session.organizationId, id, canConfigure(session.role)) });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const PUT = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, cuerpoSchema);
  if (!body.ok) return body.response;
  try {
    const { id } = await ctx.params;
    return Response.json(await guardarValorCampo(session.organizationId, id, body.data.entidadId, body.data.valor, canConfigure(session.role)));
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  const body = await parseBody(req, borrarSchema);
  if (!body.ok) return body.response;
  try {
    const { id } = await ctx.params;
    await borrarValorCampo(session.organizationId, id, body.data.entidadId, canConfigure(session.role));
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
