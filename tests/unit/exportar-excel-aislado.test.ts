import { describe, expect, it, vi } from "vitest";

vi.mock("pdfkit", () => { throw new Error("PDF no disponible"); });
vi.mock("fontkit", () => { throw new Error("Fuente PDF no disponible"); });

describe("exportación Excel independiente de PDF", () => {
  it("genera XLSX aunque no se puedan cargar las bibliotecas de PDF", async () => {
    const { exportarExcel } = await import("@/server/exportar-contactos");
    const archivo = await exportarExcel([["Prueba", "", "", "", "", "", "", ""]]);
    expect(archivo.subarray(0, 2).toString()).toBe("PK");
  });
});
