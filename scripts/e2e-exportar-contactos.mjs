import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { chromium } from "playwright";
import postgres from "postgres";

async function excel(respuesta) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await respuesta.body());
  return libro.getWorksheet("Contactos").getSheetValues().slice(1).map((fila) => fila.slice(1));
}

export async function probarExportacion({ context, anonimo, organizacionId, url, suffix }) {
  if (!process.env.WACHATO_TEST_DB_APP || !organizacionId) throw new Error("Falta base aislada para probar exportaciones");
  const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
  const otra = `org_export_${suffix}`;
  try {
    const [stage] = await db`select id, name from pipeline_stage where organization_id = ${organizacionId} order by position limit 1`;
    assert.ok(stage);
    await db`insert into organization (id, name, slug, created_at) values (${otra}, 'Ajena', ${otra}, now())`;
    await db`insert into contact (id, organization_id, name, wa_identity, phone, channel, archived_at)
      select 'ct_export_' || ${suffix} || '_' || n, ${organizacionId},
        case when n = 1 then '=Exportación fórmula' else 'Exportación ' || lpad(n::text, 3, '0') end,
        'export-' || ${suffix} || '-' || n, '5255' || lpad(n::text, 8, '0'),
        case when n = 2 then 'instagram' else 'whatsapp' end,
        case when n = 206 then now() else null end
      from generate_series(1, 206) n`;
    await db`insert into lead (id, organization_id, contact_id, stage_id, amount_cents, currency)
      select 'ld_export_' || ${suffix} || '_' || n, ${organizacionId},
        'ct_export_' || ${suffix} || '_' || n, ${stage.id}, 12345, 'DOP'
      from generate_series(1, 206) n`;
    await db`insert into conversation (id, organization_id, contact_id, channel, last_message_at)
      values (${'cv_export_' + suffix}, ${organizacionId}, ${'ct_export_' + suffix + '_3'}, 'whatsapp', '2024-01-02T03:04:05Z')`;
    await db`insert into ad_attribution (id, organization_id, contact_id, conversation_id, source_type, raw)
      values (${'ad_export_' + suffix}, ${organizacionId}, ${'ct_export_' + suffix + '_3'}, ${'cv_export_' + suffix}, 'ad', '{}')`;
    await db`insert into contact (id, organization_id, name, wa_identity)
      values (${'ct_ajeno_' + suffix}, ${otra}, 'Exportación ajena', 'ajena')`;
    await db`insert into contact (id, organization_id, name, wa_identity)
      values (${'ct_emoji_' + suffix}, ${organizacionId}, 'Prueba 🚀', ${'emoji-' + suffix})`;

    assert.equal((await anonimo.get("/api/contacts/export?format=xlsx")).status(), 401);
    assert.equal((await context.get("/api/contacts/export?format=otro")).status(), 422);
    assert.equal((await context.get("/api/contacts/export?format=xlsx&q=sin_coincidencias_e2e")).status(), 422);
    const base = `/api/contacts/export?q=exportacion&stage=${encodeURIComponent(stage.name)}`;
    const res = await context.get(`${base}&format=xlsx`);
    assert.equal(res.status(), 200);
    const filas = await excel(res);
    assert.equal(filas.length, 206);
    assert.equal(filas[0][0], "Nombre");
    assert.ok(filas.some((fila) => fila[0] === "'=Exportación fórmula"));
    assert.ok(filas.some((fila) => fila[0] === "Exportación 205"));
    assert.ok(!filas.some((fila) => String(fila[0]).includes("ajena") || fila[0] === "Exportación 206"));
    assert.ok(filas.some((fila) => fila[6] === "123.45 DOP"));
    const tercero = filas.find((fila) => fila[0] === "Exportación 003");
    assert.equal(tercero[5], "Anuncio (deducida)");
    assert.equal(tercero[7], "2024-01-02T03:04:05.000Z");
    assert.ok((await (await context.get(`/api/contacts?q=emoji-${suffix}`)).json()).contacts.some((fila) => fila.id === `ct_emoji_${suffix}`));
    const archivados = await excel(await context.get(`${base}&archived=true&format=xlsx`));
    assert.equal(archivados.length, 207);
    const canal = await excel(await context.get(`${base}&channel=instagram&format=xlsx`));
    assert.equal(canal.length, 2);
    assert.equal(canal[1][2], "Instagram");
    const listado = await context.get(`/api/contacts?q=exportacion&stage=${encodeURIComponent(stage.name)}`);
    assert.equal((await listado.json()).contacts.length, 200);
    const segunda = await context.get(`/api/contacts?q=exportacion&stage=${encodeURIComponent(stage.name)}&offset=200`);
    assert.equal((await segunda.json()).contacts.length, 5);
    const pdfRes = await context.get(`${base}&format=pdf`);
    assert.equal(pdfRes.status(), 200);
    const pdf = await getDocument({ data: new Uint8Array(await pdfRes.body()), useSystemFonts: true }).promise;
    let texto = "";
    for (let pagina = 1; pagina <= pdf.numPages; pagina++) {
      const contenido = await (await pdf.getPage(pagina)).getTextContent();
      texto += contenido.items.map((item) => item.str ?? "").join(" ") + "\n";
    }
    assert.ok(pdf.numPages > 1);
    assert.match(texto, /Exportación 205/);
    assert.match(texto, /Exportación fórmula/);
    for (let n = 2; n <= 205; n++) assert.ok(texto.includes(`Exportación ${String(n).padStart(3, "0")}`));
    assert.doesNotMatch(texto, /Exportación ajena|Exportación 206/);
    const pagina = await pdf.getPage(1);
    assert.ok(pagina.view[2] > pagina.view[3], "El PDF debe ser horizontal");
    await pdf.destroy();
    assert.equal((await context.get("/api/contacts/export?format=pdf&q=🚀")).status(), 422);
    assert.equal((await context.get("/api/contacts/export?format=xlsx&q=🚀")).status(), 200);

    if (process.env.WACHATO_TEST_CHROME) {
      const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
      const navegador = await browser.newContext({ storageState: await context.storageState(), baseURL: url, viewport: { width: 390, height: 844 }, acceptDownloads: true });
      try {
        const page = await navegador.newPage();
        await page.goto("/contacts");
        await page.getByLabel("Buscar contacto").fill("Exportación");
        await page.getByText("Exportación 205", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Cargar más" }).click();
        await page.getByText("=Exportación fórmula", { exact: true }).waitFor();
        const descarga = page.waitForEvent("download");
        await page.getByRole("button", { name: "Descargar Excel" }).click();
        const archivo = await descarga;
        assert.match(archivo.suggestedFilename(), /\.xlsx$/);
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.readFile(await archivo.path());
        assert.equal(libro.getWorksheet("Contactos").rowCount, 206);
        await page.getByLabel("Buscar contacto").fill("sin_coincidencias_e2e");
        await page.getByRole("button", { name: "Descargar PDF" }).click();
        await page.getByRole("alert").getByText("No hay contactos con esos filtros").waitFor();
        await page.route("**/api/contacts/export?*", (route) =>
          route.fulfill({ status: 500, contentType: "text/html", body: "<!DOCTYPE html><html><body>Error</body></html>" }));
        await page.getByRole("button", { name: "Descargar Excel" }).click();
        await page.getByRole("alert").getByText("No se pudo exportar (HTTP 500). Revisa los registros del servidor.").waitFor();
        await page.unroute("**/api/contacts/export?*");
        await page.route("**/api/contacts/export?*", (route) => route.abort());
        await page.getByRole("button", { name: "Descargar Excel" }).click();
        await page.getByRole("alert").getByText("No se pudo conectar para exportar").waitFor();
      } finally {
        await navegador.close();
        await browser.close();
      }
    }
    console.log("OK: exportación filtrada XLSX/PDF, aislamiento, paginación, errores y descarga móvil.");
  } finally {
    await db.end();
  }
}
