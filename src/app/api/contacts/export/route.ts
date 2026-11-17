import { z } from "zod";
import { apiError, withAuth } from "@/lib/api";
import { leerFiltrosContactos, listarContactos } from "@/server/contactos-lista";
import { ErrorExportacionPdf, exportarExcel, exportarPdf, filasExportacion } from "@/server/exportar-contactos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withAuth(async (session, req: Request) => {
  const params = new URL(req.url).searchParams;
  const formato = z.enum(["xlsx", "pdf"]).safeParse(params.get("format"));
  const filtros = leerFiltrosContactos(params);
  if (!formato.success || !filtros.success) return apiError(422, "invalid_query", "Formato o filtros inválidos");
  const filas = filasExportacion(await listarContactos(session.organizationId, filtros.data));
  if (filas.length === 0) return apiError(422, "empty_export", "No hay contactos con esos filtros");
  let archivo: Buffer;
  try {
    archivo = formato.data === "xlsx" ? await exportarExcel(filas) : await exportarPdf(filas);
  } catch (error) {
    if (error instanceof ErrorExportacionPdf) return apiError(422, "pdf_no_admite_datos", error.message);
    throw error;
  }
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": formato.data === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/pdf",
      "Content-Disposition": `attachment; filename="contactos-${new Date().toISOString().slice(0, 10)}.${formato.data}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
