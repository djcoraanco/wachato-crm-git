import assert from "node:assert/strict";
import { chromium } from "playwright";
import postgres from "postgres";

export async function probarFiltroManual({ context, organizacionId, url, suffix }) {
  const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
  try {
    const nombres = [`Manual ${suffix}`, `Traspaso ${suffix}`, `Agente ${suffix}`];
    for (let i = 0; i < nombres.length; i++) {
      const id = `ct_filtro_${i}_${suffix}`;
      await db`insert into contact (id, organization_id, wa_identity, name)
        values (${id}, ${organizacionId}, ${`bsuid:filtro_${i}_${suffix}`}, ${nombres[i]})`;
      await db`insert into conversation (id, organization_id, contact_id, ai_enabled, handoff_at)
        values (${`cv_filtro_${i}_${suffix}`}, ${organizacionId}, ${id}, ${i !== 0}, ${i === 1 ? new Date() : null})`;
    }
    const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
    const navegador = await browser.newContext({ storageState: await context.storageState(), baseURL: url, viewport: { width: 390, height: 844 } });
    try {
      const page = await navegador.newPage();
      await page.goto("/inbox");
      for (const nombre of nombres) await page.getByText(nombre, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Filtrar", exact: true }).click();
      await page.getByLabel("Atención manual").check();
      await page.getByText(nombres[0], { exact: true }).waitFor();
      await page.getByText(nombres[1], { exact: true }).waitFor();
      assert.equal(await page.getByText(nombres[2], { exact: true }).count(), 0);
      await page.getByRole("button", { name: /Limpiar filtros/ }).click();
      await page.getByText(nombres[2], { exact: true }).waitFor();
      await page.getByText(nombres[0], { exact: true }).click();
      await page.getByRole("button", { name: "Volver a las conversaciones" }).waitFor();
      await page.getByRole("button", { name: "Mostrar detalles" }).click();
      await page.getByRole("button", { name: "Ocultar panel" }).waitFor();
      await page.getByRole("button", { name: "Ocultar panel" }).click();
      await page.getByRole("button", { name: "Volver a las conversaciones" }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload();
      await page.getByText(nombres[0], { exact: true }).click();
      const lista = page.getByRole("button", { name: "Filtrar", exact: true }).locator("xpath=ancestor::section[1]");
      const detalles = page.getByRole("button", { name: "Ocultar panel" }).locator("xpath=ancestor::section[1]");
      const rectLista = await lista.boundingBox();
      const rectDetalles = await detalles.boundingBox();
      assert.equal(Math.round(rectLista.width), 300);
      assert.equal(Math.round(rectDetalles.width), 300);
      assert.ok(rectDetalles.x >= rectLista.x + rectLista.width, "Las columnas no deben solaparse");
    } finally {
      await navegador.close();
      await browser.close();
    }
    console.log("OK: filtro de atención manual y limpieza en la bandeja móvil.");
  } finally {
    await db.end();
  }
}
