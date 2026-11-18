import { apiError, withAuth } from "@/lib/api";
import { borrarAvatar, ErrorAvatar, estadoAvatar, guardarAvatar, leerImagenAvatar } from "@/server/avatar-contacto";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    return Response.json({ avatar: await estadoAvatar(session.organizationId, (await ctx.params).id) },
      { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ErrorAvatar) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  try {
    const id = (await ctx.params).id;
    await estadoAvatar(session.organizationId, id);
    const bytes = await leerImagenAvatar(req);
    return Response.json({ avatar: await guardarAvatar(session.organizationId, id, bytes) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorAvatar) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    await borrarAvatar(session.organizationId, (await ctx.params).id);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorAvatar) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
