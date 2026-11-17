import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { actividadSchema } from "@/lib/crm-comercial";
import { crearActividad, ErrorComercial, listarActividades } from "@/server/crm-comercial";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const contactoId = z.string().min(1).max(100).safeParse(new URL(req.url).searchParams.get("contactoId"));
  if (!contactoId.success) return apiError(422, "invalid_contact", "Selecciona un contacto");
  return Response.json({ actividades: await listarActividades(session.organizationId, contactoId.data) });
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, actividadSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ actividad: await crearActividad(session.organizationId, body.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof ErrorComercial) return apiError(error.status, error.code, error.message);
    throw error;
  }
});
