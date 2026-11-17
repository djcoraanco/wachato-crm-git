import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { ErrorExportacionPdf, exportarExcel, exportarPdf, textoSeguroExcel } from "@/server/exportar-contactos";

describe("exportación de contactos", () => {
  it("neutraliza fórmulas incluso con espacios iniciales", () => {
    for (const texto of ["=1+1", " +SUM(A1)", "\t-1", "@SUM(A1)"]) {
      expect(textoSeguroExcel(texto)).toBe(`'${texto}`);
    }
    expect(textoSeguroExcel("Ana Pérez")).toBe("Ana Pérez");
  });

  it("escribe las celdas como texto, no como fórmulas", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.read(Readable.from(await exportarExcel([["=1+1", "+52123456789", "WhatsApp", "", "", "", "", ""]])));
    const hoja = libro.getWorksheet("Contactos")!;
    expect(hoja.getCell("A2").value).toBe("'=1+1");
    expect(hoja.getCell("B2").value).toBe("'+52123456789");
  });

  it("rechaza caracteres que la fuente PDF no puede representar", async () => {
    await expect(exportarPdf([["🚀"]])).rejects.toBeInstanceOf(ErrorExportacionPdf);
  });
});
