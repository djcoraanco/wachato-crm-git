import { apiError, withAuth } from "@/lib/api";
import { ErrorAvatar, leerAvatar } from "@/server/avatar-contacto";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  try {
    const bytes = await leerAvatar(session.organizationId, (await ctx.params).id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "image/png",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof ErrorAvatar) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
