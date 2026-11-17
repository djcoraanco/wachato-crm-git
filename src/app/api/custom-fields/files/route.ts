import { apiError, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { idCampoSchema, nombreArchivoCampoSchema } from "@/lib/campos-personalizados";
import { ErrorCampo } from "@/server/campos-personalizados";
import { guardarArchivoCampo, leerArchivoLimitado, listarArchivosCampo } from "@/server/archivos-campos";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const campo = idCampoSchema.safeParse(new URL(req.url).searchParams.get("campoId"));
  if (!campo.success) return apiError(422, "invalid_field", "Campo de archivo inválido");
  try {
    return Response.json({ archivos: await listarArchivosCampo(session.organizationId, campo.data, canConfigure(session.role)) });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});

export const POST = withAuth(async (session, req: Request) => {
  const campo = idCampoSchema.safeParse(req.headers.get("x-campo-id"));
  if (!campo.success) return apiError(422, "invalid_field", "Campo de archivo inválido");
  let nombreDecodificado: string;
  try {
    nombreDecodificado = decodeURIComponent(req.headers.get("x-file-name") ?? "");
  } catch (error) {
    if (error instanceof URIError) return apiError(422, "invalid_name", "Nombre de archivo inválido");
    throw error;
  }
  const nombre = nombreArchivoCampoSchema.safeParse(nombreDecodificado);
  if (!nombre.success) return apiError(422, "invalid_name", "Nombre de archivo inválido");
  try {
    const bytes = await leerArchivoLimitado(req);
    return Response.json({
      archivo: await guardarArchivoCampo(session.organizationId, campo.data, canConfigure(session.role), nombre.data, bytes),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCampo) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
