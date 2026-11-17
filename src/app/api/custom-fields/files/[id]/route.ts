import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { borrarArchivoCampo, obtenerArchivoCampo } from "@/server/archivos-campos";
import { ErrorCampo } from "@/server/campos-personalizados";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    const { id } = await ctx.params;
    const archivo = await obtenerArchivoCampo(session.organizationId, id, canConfigure(session.role));
    return new Response(new Uint8Array(archivo.bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });

  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  try {
    const { id } = await ctx.params;
    const confirmar = new URL(req.url).searchParams.get("confirmarAlmacenAnterior") === "true";
    await borrarArchivoCampo(session.organizationId, id, canConfigure(session.role), confirmar);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
