import assert from "node:assert/strict";
import { chromium } from "playwright";

export async function probarContactoManual({ context, url, suffix }) {
  if (!process.env.WACHATO_TEST_CHROME) throw new Error("Falta Chromium para probar el alta manual");
  const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
  const navegador = await browser.newContext({
    storageState: await context.storageState(),
    baseURL: url,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await navegador.newPage();
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Nuevo contacto", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo contacto" });
    await dialogo.getByLabel("Etapa inicial").locator("option").first().waitFor({ state: "attached" });
    const nombre = `Alta manual ${suffix}`;
    await dialogo.getByLabel("Nombre", { exact: true }).fill(nombre);
    await dialogo.getByLabel("Teléfono con código de país").fill("+1 (809) 555-1234");
    const guardado = page.waitForResponse((response) =>
      response.url().endsWith("/api/contacts") && response.request().method() === "POST");
    await dialogo.getByRole("button", { name: "Crear contacto" }).click();
    assert.equal((await guardado).status(), 201);
    await dialogo.waitFor({ state: "hidden" });
    await page.getByText(nombre, { exact: true }).waitFor();
    const consulta = await context.get("/api/contacts?q=18095551234");
    assert.equal(consulta.status(), 200);
    const contacto = (await consulta.json()).contacts.find((item) => item.name === nombre);
    assert.equal(contacto.phone, "18095551234");
    assert.ok(contacto.stageName);

    await page.getByRole("button", { name: "Nuevo contacto", exact: true }).click();
    await dialogo.getByLabel("Etapa inicial").locator("option").first().waitFor({ state: "attached" });
    await dialogo.getByLabel("Nombre", { exact: true }).fill("Duplicado");
    await dialogo.getByLabel("Teléfono con código de país").fill("+1 809 555 1234");
    const duplicado = page.waitForResponse((response) =>
      response.url().endsWith("/api/contacts") && response.request().method() === "POST");
    await dialogo.getByRole("button", { name: "Crear contacto" }).click();
    assert.equal((await duplicado).status(), 409);
    await dialogo.getByText(/Ya existe un contacto con ese teléfono/).waitFor();
    await page.route("**/api/contacts", (route) => route.abort());
    await dialogo.getByRole("button", { name: "Crear contacto" }).click();
    await dialogo.getByText("No se pudo guardar. Revisa tu conexión.").waitFor();
  } finally {
    await navegador.close();
    await browser.close();
  }
  console.log("OK: creación manual desde Contactos con teléfono formateado y rechazo de duplicados.");
}
