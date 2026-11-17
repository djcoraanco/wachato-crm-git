import path from "node:path";
import { existsSync } from "node:fs";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { openSync } from "fontkit";
import { CHANNEL_LABEL } from "@/lib/channels";
import { cuentaComoAnuncio } from "@/lib/anuncios";
import { SOURCE_LABELS, effectiveSource } from "@/server/contact-source";
import { listarContactos } from "@/server/contactos-lista";

type Contactos = Awaited<ReturnType<typeof listarContactos>>;
const cabeceras = ["Nombre", "Teléfono / usuario", "Canal", "Etapa", "Etiquetas", "Origen", "Valor", "Último mensaje"];
const anchos = [105, 115, 65, 90, 55, 75, 92, 95];
const fuenteImagen = path.join(process.cwd(), "fonts", "unifont.woff");
const fuente = existsSync(fuenteImagen)
  ? fuenteImagen
  : path.join(process.cwd(), "node_modules", "@fontsource", "unifont", "files", "unifont-latin-400-normal.woff");

export function filasExportacion(contactos: Contactos): string[][] {
  return contactos.map(({ contact, stageName, amountCents, currency, lastMessageAt, origen }) => [
    contact.name,
    contact.phone ?? contact.waIdentity,
    CHANNEL_LABEL[contact.channel],
    stageName ?? "",
    "",
    `${SOURCE_LABELS[effectiveSource(contact.source, cuentaComoAnuncio(origen)).value]}${!contact.source && cuentaComoAnuncio(origen) ? " (deducida)" : ""}`,
    amountCents === null ? "" : `${(amountCents / 100).toFixed(2)} ${currency ?? ""}`.trim(),
    lastMessageAt?.toISOString() ?? "",
  ]);
}

export function textoSeguroExcel(texto: string): string {
  return /^[\s\u0000-\u001f]*[=+\-@]/u.test(texto) ? `'${texto}` : texto;
}

export async function exportarExcel(filas: string[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Contactos");
  hoja.addRow(cabeceras);
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((columna, i) => { columna.width = Math.ceil((anchos[i] ?? 100) / 5); });
  for (const fila of filas) hoja.addRow(fila.map(textoSeguroExcel));
  const data = await libro.xlsx.writeBuffer();
  return Buffer.from(data);
}

export class ErrorExportacionPdf extends Error {}

export async function exportarPdf(filas: string[][]): Promise<Buffer> {
  const font = openSync(fuente);
  if (!("hasGlyphForCodePoint" in font)) {
    throw new Error("La fuente configurada no es una fuente individual");
  }
  for (const texto of [...cabeceras, ...filas.flat()]) {
    for (const caracter of texto) {
      const code = caracter.codePointAt(0)!;
      if (code !== 10 && code !== 13 && !font.hasGlyphForCodePoint(code)) {
        throw new ErrorExportacionPdf("El PDF no admite algunos caracteres. Descarga Excel para conservarlos.");
      }
    }
  }
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, autoFirstPage: true });
  const partes: Buffer[] = [];
  const terminado = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (parte: Buffer) => partes.push(parte));
    doc.on("end", () => resolve(Buffer.concat(partes)));
    doc.on("error", reject);
  });
  doc.font(fuente).fontSize(8);
  let y = 36;
  const renglon = (datos: string[], cabecera = false) => {
    const altura = Math.max(20, ...datos.map((texto, i) =>
      doc.heightOfString(texto || " ", { width: (anchos[i] ?? 100) - 8 }) + 8
    ));
    if (altura > doc.page.height - 110) {
      throw new ErrorExportacionPdf("Un dato es demasiado largo para el PDF. Descarga Excel para conservarlo.");
    }
    if (y + altura > doc.page.height - 36) {
      doc.addPage();
      y = 36;
      if (!cabecera) renglon(cabeceras, true);
    }
    let x = 36;
    for (let i = 0; i < anchos.length; i++) {
      const ancho = anchos[i] ?? 100;
      if (cabecera) doc.rect(x, y, ancho, altura).fill("#009c98").fillColor("#ffffff");
      else doc.rect(x, y, ancho, altura).strokeColor("#dddddd").stroke().fillColor("#111111");
      doc.text(datos[i] ?? "", x + 4, y + 4, { width: ancho - 8, lineBreak: true });
      x += ancho;
    }
    y += altura;
  };
  doc.fontSize(14).text("Contactos", 36, y);
  y += 26;
  doc.fontSize(8);
  renglon(cabeceras, true);
  for (const fila of filas) renglon(fila);
  doc.end();
  return terminado;
}
