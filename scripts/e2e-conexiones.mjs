import assert from "node:assert/strict";
import { chromium } from "playwright";
import postgres from "postgres";

export async function probarConexiones({ context, anonimo, organizacionId, url, suffix }) {
  const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
  try {
    await db`insert into template (id, organization_id, name, language, category, body, status)
      values (${'tpl_conex_' + suffix}, ${organizacionId}, 'plantilla_prueba', 'es', 'UTILITY', 'Prueba', 'approved')`;
    await db`insert into template (id, organization_id, name, language, category, body, status)
      values (${'tpl_ajena_' + suffix}, ${'org_export_' + suffix}, 'plantilla_ajena', 'es', 'UTILITY', 'Ajena', 'approved')`;
    for (const [indice, org] of [organizacionId, `org_export_${suffix}`].entries()) {
      const contactoId = `ct_conex_${indice}_${suffix}`;
      const conversacionId = `cv_conex_${indice}_${suffix}`;
      await db`insert into contact (id, organization_id, wa_identity, name)
        values (${contactoId}, ${org}, ${`bsuid:conex_${indice}_${suffix}`}, ${indice === 0 ? "Contacto CAPI" : "Contacto ajeno"})`;
      await db`insert into conversation (id, organization_id, contact_id) values (${conversacionId}, ${org}, ${contactoId})`;
      await db`insert into conversion_event (id, organization_id, conversation_id, event_name, status)
        values (${`evt_conex_${indice}_${suffix}`}, ${org}, ${conversacionId}, ${indice === 0 ? "Compra prueba" : "Compra ajena"}, 'failed')`;
    }
    const anon = await anonimo.get("/connections", { maxRedirects: 0 });
    assert.ok([302, 303, 307, 308].includes(anon.status()), `Sin sesión: ${anon.status()}`);
    const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
    const navegador = await browser.newContext({ storageState: await context.storageState(), baseURL: url, viewport: { width: 390, height: 844 } });
    try {
      const page = await navegador.newPage();
      await page.goto("/connections");
      await page.getByRole("heading", { name: "Conexiones" }).waitFor();
      await page.getByRole("heading", { name: "WhatsApp", exact: true }).waitFor();
      await page.getByText("plantilla_prueba").waitFor();
      assert.equal(await page.getByText("plantilla_ajena").count(), 0);
      await page.getByText(/su estado no se comprueba desde esta pantalla/).waitFor();
      if (process.env.ATRIBUCION !== "on") {
        await page.getByText("La atribución está desactivada en esta instancia.").waitFor();
        assert.equal(await page.getByRole("link", { name: "Configurar anuncios" }).count(), 0);
        assert.equal(await page.getByText("Compra prueba").count(), 0);
      } else {
        await page.getByRole("link", { name: "Configurar anuncios" }).waitFor();
        await page.getByText("Compra prueba").waitFor();
        await page.getByText("Fallido").waitFor();
        assert.equal(await page.getByText("Compra ajena").count(), 0);
      }
      assert.equal(await page.getByRole("link", { name: "Administrar plantillas" }).getAttribute("href"), "/settings/templates");
      const [miembro] = await db`select id, role from member where organization_id = ${organizacionId} limit 1`;
      assert.ok(miembro, "Falta el miembro de prueba");
      try {
        await db`update member set role = 'member' where id = ${miembro.id}`;
        await page.reload();
        await page.getByRole("heading", { name: "Conexiones" }).waitFor();
        assert.equal(await page.getByRole("link", { name: "Administrar plantillas" }).count(), 0);
        assert.equal(await page.getByRole("link", { name: "Configurar WhatsApp" }).count(), 0);
        assert.equal(await page.getByRole("link", { name: "Configurar anuncios" }).count(), 0);
      } finally {
        await db`update member set role = ${miembro.role} where id = ${miembro.id}`;
      }
    } finally {
      await navegador.close();
      await browser.close();
    }
    console.log("OK: conexiones autenticadas, plantillas aisladas y estado real de atribución.");
  } finally {
    await db.end();
  }
}
