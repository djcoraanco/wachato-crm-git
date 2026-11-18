/**
 * UI comercial contra una app local de pruebas con base vacía y mocks.
 * WACHATO_TEST_BASE_URL y WACHATO_TEST_DB_APP deben señalar la misma instancia
 * desechable; nunca ejecutar contra una instalación con datos reales.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium, request } from "playwright";
import postgres from "postgres";
import { probarCamposTratos } from "./e2e-campos-tratos.mjs";

const base = new URL(process.env.WACHATO_TEST_BASE_URL ?? "");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("WACHATO_TEST_BASE_URL debe señalar una aplicación local de pruebas");
}
const database = new URL(process.env.WACHATO_TEST_DB_APP ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    !database.pathname.startsWith("/wachato_test_")) {
  throw new Error("WACHATO_TEST_DB_APP debe señalar una base local desechable wachato_test_*");
}
if (process.env.WACHATO_TEST_ALLOW_WRITE !== "base-vacia") {
  throw new Error("Confirma el uso exclusivo de una instancia desechable con WACHATO_TEST_ALLOW_WRITE=base-vacia");
}
const url = base.origin;
const suffix = randomBytes(5).toString("hex");
const context = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const anonimo = await request.newContext({ baseURL: url });
const miembro = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const db = postgres(database.toString(), { max: 1 });
let browser;

async function status(response, esperado, nombre) {
  assert.equal(response.status(), esperado, `${nombre}: HTTP ${response.status()} ${await response.text()}`);
  return response;
}

async function arrastrarConRaton(page, tarjeta, columna) {
  const origen = await tarjeta.boundingBox();
  const destino = await columna.boundingBox();
  assert.ok(origen && destino, "El trato y la etapa son visibles para el arrastre");
  await page.mouse.move(origen.x + origen.width / 2, origen.y + origen.height / 2);
  await page.mouse.down();
  await page.mouse.move(destino.x + destino.width / 2, destino.y + destino.height / 2, { steps: 20 });
  await page.mouse.up();
}

try {
  const [organizaciones] = await db`select count(*)::int as total from organization`;
  assert.equal(organizaciones.total, 0, "La prueba requiere una base vacía");
  await status(await anonimo.get("/api/crm/pipelines"), 401, "Sin sesión");
  await status(await anonimo.post("/api/crm/deals", { data: {} }), 401, "Trato sin sesión");
  await status(await anonimo.get("/api/crm/activities?contactoId=no-existe"), 401, "Actividades sin sesión");

  await status(await context.post("/api/auth/sign-up/email", {
    data: { email: `pipeline-${suffix}@example.test`, password: "e2e-ficticio-seguro", name: "Prueba Pipeline" },
  }), 200, "Registro");
  const contactoResponse = await status(await context.post("/api/contacts", {
    data: { name: `Contacto ${suffix}`, phone: `1809${String(Number.parseInt(suffix.slice(0, 6), 16)).padStart(8, "0").slice(-8)}` },
  }), 201, "Contacto");
  const { contact: contacto, lead } = await contactoResponse.json();
  const antes = await (await status(await context.get("/api/pipeline/board"), 200, "Tablero inicial")).json();
  const leadInicial = antes.leads.find((item) => item.id === lead.id);
  assert.ok(leadInicial);

  browser = await chromium.launch({
    ...(process.env.WACHATO_TEST_CHROME ? { executablePath: process.env.WACHATO_TEST_CHROME } : {}),
    headless: true,
  });
  const navegador = await browser.newContext({
    storageState: await context.storageState(),
    baseURL: url,
    viewport: { width: 1280, height: 800 },
  });
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(15000);
    await page.goto("/pipeline");
    const selector = page.getByLabel("Seleccionar embudo");
    await selector.locator("option").filter({ hasText: "Principal" }).waitFor({ state: "attached" });
    await page.getByLabel(`Abrir el trato de ${contacto.name}`).waitFor();

    await page.getByRole("button", { name: "Nuevo embudo" }).click();
    const nuevoEmbudo = page.getByRole("dialog", { name: "Crear embudo" });
    await nuevoEmbudo.getByLabel("Nombre").fill(`Ventas ${suffix}`);
    const creando = page.waitForResponse((response) =>
      response.url().endsWith("/api/crm/pipelines") && response.request().method() === "POST");
    await nuevoEmbudo.getByRole("button", { name: "Crear", exact: true }).click();
    const embudo = (await (await status(await creando, 201, "Crear embudo desde UI")).json()).embudo;
    await nuevoEmbudo.waitFor({ state: "hidden" });
    await selector.locator(`option[value="${embudo.id}"]`).waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Gestionar etapas" }).click();
    const manager = page.getByRole("dialog", { name: "Gestionar etapas del embudo" });
    await manager.getByLabel("Nombre de la nueva etapa").fill("Propuesta");
    const creandoEtapa = page.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/pipelines/${embudo.id}/stages`) && response.request().method() === "POST");
    await manager.getByRole("button", { name: "Agregar" }).click();
    const etapa = (await (await status(await creandoEtapa, 201, "Crear etapa desde UI")).json()).etapa;
    await manager.getByLabel("Nombre de etapa Propuesta").waitFor();
    await manager.getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("button", { name: "Nuevo trato" }).click();
    const crear = page.getByRole("dialog", { name: "Nuevo trato" });
    await crear.getByLabel("Nombre del trato").fill(`Servicio ${suffix}`);
    await crear.getByLabel("Buscar contacto").fill(contacto.name);
    await crear.getByRole("button", { name: new RegExp(contacto.name) }).click();
    await crear.getByLabel("Importe (opcional)").fill("-1");
    assert.equal(await crear.getByRole("button", { name: "Crear trato" }).isDisabled(), true);
    await crear.getByLabel("Importe (opcional)").fill("125.50");
    await crear.getByLabel("Moneda").selectOption("USD");
    const creandoTrato = page.waitForResponse((response) =>
      response.url().endsWith("/api/crm/deals") && response.request().method() === "POST");
    await crear.getByRole("button", { name: "Crear trato" }).click();
    const trato = (await (await status(await creandoTrato, 201, "Crear trato desde UI")).json()).trato;
    await crear.waitFor({ state: "hidden" });
    const tarjeta = page.getByLabel(`Abrir el trato Servicio ${suffix}`);
    await tarjeta.waitFor();
    await page.getByText("Tratos · USD").waitFor();
    await tarjeta.click();
    const cajon = page.getByRole("dialog", { name: `Trato: Servicio ${suffix}` });
    await cajon.locator("label").filter({ hasText: /^Etapa/ }).locator("select").selectOption(etapa.id);
    const moviendo = page.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/deals/${trato.id}`) && response.request().method() === "PATCH");
    await cajon.getByRole("button", { name: "Guardar cambios" }).click();
    await status(await moviendo, 200, "Mover trato desde UI");
    await cajon.waitFor({ state: "hidden" });
    await tarjeta.waitFor();
    const datos = await (await status(await context.get(`/api/crm/pipelines/${embudo.id}/board`), 200, "Tablero comercial")).json();
    assert.equal(datos.tratos.find((item) => item.id === trato.id).etapaId, etapa.id);
    assert.deepEqual(datos.tratos.find((item) => item.id === trato.id).monto, { centavos: 12550, moneda: "USD" });

    await tarjeta.click();
    await cajon.locator("label").filter({ hasText: /^Tipo/ }).locator("select").selectOption("llamada");
    await cajon.getByLabel("Detalle").fill(`Llamada ${suffix}`);
    const actividad = page.waitForResponse((response) =>
      response.url().endsWith("/api/crm/activities") && response.request().method() === "POST");
    await cajon.getByRole("button", { name: "Registrar actividad" }).click();
    await status(await actividad, 201, "Registrar actividad desde UI");
    await cajon.getByText(`Llamada ${suffix}`).waitFor();
    await page.route("**/api/crm/activities", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue());
    await cajon.getByLabel("Detalle").fill("Sin conexión");
    await cajon.getByRole("button", { name: "Registrar actividad" }).click();
    await cajon.getByRole("alert").getByText("No se pudo conectar para guardar la actividad").waitFor();
    assert.equal(await cajon.getByLabel("Detalle").inputValue(), "Sin conexión");
    await page.unroute("**/api/crm/activities");
    await cajon.getByRole("button", { name: "Cerrar panel del trato" }).click();
    await page.reload();
    await selector.selectOption(embudo.id);
    await tarjeta.click();
    await cajon.getByText(`Llamada ${suffix}`).waitFor();

    await page.route(`**/api/crm/deals/${trato.id}`, (route) =>
      route.request().method() === "PATCH" ? route.abort() : route.continue());
    await cajon.getByLabel("Nombre", { exact: true }).fill("Cambio sin conexión");
    await cajon.getByRole("button", { name: "Guardar cambios" }).click();
    await cajon.getByRole("alert").getByText("No se pudo conectar para guardar el trato").waitFor();
    assert.equal(await cajon.getByLabel("Nombre", { exact: true }).inputValue(), "Cambio sin conexión");
    await page.unroute(`**/api/crm/deals/${trato.id}`);
    await cajon.getByRole("button", { name: "Cerrar panel del trato" }).click();
    await page.getByRole("button", { name: "Gestionar etapas" }).click();
    await manager.getByLabel("Eliminar Propuesta").click();
    await manager.getByRole("alert").getByText("Mueve primero los tratos de esta etapa").waitFor();
    await manager.getByRole("button", { name: "Cerrar" }).click();
    const columnaNuevo = page.locator("div.snap-start").filter({ has: page.getByText("Nuevo", { exact: true }) });
    const columnaPropuesta = page.locator("div.snap-start").filter({ has: page.getByText("Propuesta", { exact: true }) });
    const rutaTrato = `**/api/crm/deals/${trato.id}`;
    await page.route(rutaTrato, (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.continue({ postData: JSON.stringify({ etapaId: leadInicial.stageId }) });
    });
    const rechazo = page.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/deals/${trato.id}`) && response.request().method() === "PATCH");
    await arrastrarConRaton(page, tarjeta, columnaNuevo);
    await status(await rechazo, 422, "Rechazo de etapa de otro embudo");
    await page.getByRole("alert").getByText("Etapa inválida para el embudo").waitFor();
    await columnaPropuesta.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    const tableroRechazado = await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json();
    assert.equal(tableroRechazado.tratos.find((item) => item.id === trato.id).etapaId, etapa.id);
    await page.unroute(rutaTrato);
    await page.reload();
    await selector.selectOption(embudo.id);
    await columnaPropuesta.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    const arrastrando = page.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/deals/${trato.id}`) && response.request().method() === "PATCH");
    await arrastrarConRaton(page, tarjeta, columnaNuevo);
    await status(await arrastrando, 200, "Arrastrar trato entre etapas");
    await columnaNuevo.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    const tableroArrastre = await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json();
    const etapaNuevo = tableroArrastre.etapas.find((item) => item.nombre === "Nuevo");
    assert.equal(tableroArrastre.tratos.find((item) => item.id === trato.id).etapaId, etapaNuevo.id);
    await status(await context.post("/api/crm/deals", {
      data: { titulo: `Peso ${suffix}`, contactoId: contacto.id, embudoId: embudo.id,
        etapaId: etapaNuevo.id, monto: { centavos: 2000, moneda: "MXN" } },
    }), 201, "Segundo trato en otra moneda");
    await page.reload();
    await selector.selectOption(embudo.id);
    const columnaMixta = page.locator("div.snap-start").filter({ has: page.getByText("Nuevo", { exact: true }) });
    await columnaMixta.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    await columnaMixta.getByText("Tratos · USD").waitFor();
    await columnaMixta.getByText("Tratos · MXN").waitFor();
    assert.match(await columnaMixta.innerText(), /125[.,]50/);
    assert.match(await columnaMixta.innerText(), /20[.,]00/);
    await tarjeta.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert.equal((await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json())
      .tratos.find((item) => item.id === trato.id).etapaId, etapaNuevo.id);
    await tarjeta.focus();
    await page.keyboard.press("Space");
    for (let i = 0; i < 13; i++) await page.keyboard.press("ArrowRight");
    const moviendoTeclado = page.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/deals/${trato.id}`) && response.request().method() === "PATCH");
    await page.keyboard.press("Space");
    await status(await moviendoTeclado, 200, "Mover trato con teclado");
    await columnaPropuesta.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    assert.equal(await cajon.isVisible(), false, "Arrastrar con teclado no abre el cajón");
    const tecladoGuardado = await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json();
    assert.equal(tecladoGuardado.tratos.find((item) => item.id === trato.id).etapaId, etapa.id);
    await tarjeta.focus();
    await page.keyboard.press("Enter");
    await cajon.waitFor();
    await cajon.getByRole("button", { name: "Cerrar panel del trato" }).click();

    await page.getByRole("button", { name: "Nuevo embudo" }).click();
    await nuevoEmbudo.getByLabel("Nombre").fill(`Ventas ${suffix}`);
    await nuevoEmbudo.getByRole("button", { name: "Crear", exact: true }).click();
    await nuevoEmbudo.getByRole("alert").waitFor();
    await nuevoEmbudo.getByRole("button", { name: "Cancelar" }).click();

    await status(await context.post("/api/crm/deals", {
      data: { titulo: `Principal ${suffix}`, contactoId: contacto.id, embudoId: "predeterminado",
        etapaId: leadInicial.stageId, monto: { centavos: 2500, moneda: "USD" } },
    }), 201, "Trato adicional en el embudo principal");
    await selector.selectOption("predeterminado");
    await page.getByLabel(`Abrir el trato de ${contacto.name}`).waitFor();
    await page.getByLabel(`Abrir el trato Principal ${suffix}`).waitFor();
    const despues = await (await context.get("/api/pipeline/board")).json();
    assert.equal(despues.leads.find((item) => item.id === lead.id).stageId, leadInicial.stageId);

    const movil = await browser.newContext({
      baseURL: url, storageState: await context.storageState(),
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    const pantallaMovil = await movil.newPage();
    await pantallaMovil.goto("/pipeline");
    await pantallaMovil.getByLabel("Seleccionar embudo").selectOption(embudo.id);
    const tratoMovil = pantallaMovil.getByLabel(`Abrir el trato Servicio ${suffix}`);
    const nuevoMovil = pantallaMovil.locator("div.snap-start").filter({ has: pantallaMovil.getByText("Nuevo", { exact: true }) });
    await tratoMovil.waitFor();
    await nuevoMovil.evaluate((columna) => { columna.parentElement.parentElement.scrollLeft = 0; });
    await pantallaMovil.waitForTimeout(300);
    const origenMovil = await tratoMovil.boundingBox();
    const destinoMovil = await nuevoMovil.boundingBox();
    assert.ok(origenMovil && destinoMovil, "El trato y la etapa existen en móvil");
    const inicioX = Math.max(5, Math.min(385, origenMovil.x + 12));
    const finX = Math.max(5, Math.min(385, destinoMovil.x + destinoMovil.width / 2));
    const inicioY = origenMovil.y + origenMovil.height / 2;
    const finY = Math.max(destinoMovil.y + 20, Math.min(824, inicioY));
    assert.ok(await tratoMovil.evaluate((elemento, punto) =>
      elemento.contains(document.elementFromPoint(punto.x, punto.y)), { x: inicioX, y: inicioY }),
    `El punto táctil debe caer sobre el trato: ${JSON.stringify({ origenMovil, destinoMovil, inicioX, inicioY })}`);
    const cdp = await movil.newCDPSession(pantallaMovil);
    const movimientoMovil = pantallaMovil.waitForResponse((response) =>
      response.url().endsWith(`/api/crm/deals/${trato.id}`) && response.request().method() === "PATCH");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: inicioX, y: inicioY }] });
    for (let paso = 1; paso <= 20; paso++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove", touchPoints: [{ x: inicioX + (finX - inicioX) * paso / 20, y: inicioY + (finY - inicioY) * paso / 20 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await status(await movimientoMovil, 200, "Mover trato con gesto táctil");
    const tactilGuardado = await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json();
    assert.equal(tactilGuardado.tratos.find((item) => item.id === trato.id).etapaId, etapaNuevo.id);
    await pantallaMovil.reload();
    await pantallaMovil.getByLabel("Seleccionar embudo").selectOption(embudo.id);
    await nuevoMovil.getByLabel(`Abrir el trato Servicio ${suffix}`).waitFor();
    await movil.close();

    const correo = `miembro-${suffix}@example.test`;
    await status(await context.post("/api/settings/team", {
      data: { name: "Miembro", email: correo, password: "e2e-miembro-seguro" },
    }), 201, "Crear miembro");
    await status(await miembro.post("/api/auth/sign-in/email", {
      data: { email: correo, password: "e2e-miembro-seguro" },
    }), 200, "Ingresar miembro");
    await status(await miembro.get(`/api/crm/pipelines/${embudo.id}/board`), 200, "Miembro de la organización");
    const otroTrato = tableroArrastre.tratos.find((item) => item.id !== trato.id)
      ?? (await (await context.get(`/api/crm/pipelines/${embudo.id}/board`)).json()).tratos.find((item) => item.id !== trato.id);
    assert.ok(otroTrato);
    const camposTrato = await probarCamposTratos({
      page, browser, context, miembro, url, embudo, trato, otroTrato, titulo: `Servicio ${suffix}`,
    });
    const [membership] = await db`select member.id, member.organization_id from member join "user"
      on "user".id = member.user_id where "user".email = ${correo}`;
    const otra = `org_pipeline_${suffix}`;
    await db`insert into organization (id, name, slug, created_at)
      values (${otra}, 'Otra organización', ${otra}, now())`;
    await db`update member set organization_id = ${otra} where id = ${membership.id}`;
    try {
      await status(await miembro.get(`/api/crm/pipelines/${embudo.id}/board`), 404, "Tablero ajeno");
      await status(await miembro.patch(`/api/crm/deals/${trato.id}`, { data: { titulo: "Intruso" } }), 404, "Trato ajeno");
      await status(await miembro.get(`/api/crm/deal-fields/${camposTrato.equipo.id}/values?entidadId=${trato.id}`), 404, "Campo ajeno");
      await status(await miembro.put(`/api/crm/deal-fields/${camposTrato.equipo.id}/values`, {
        data: { entidadId: trato.id, valor: "Intruso" },
      }), 404, "Valor ajeno");
      await status(await miembro.post("/api/crm/activities", {
        data: { tratoId: trato.id, tipo: "nota", contenido: "Intruso" },
      }), 404, "Actividad ajena");
    } finally {
      await db`update member set organization_id = ${membership.organization_id} where id = ${membership.id}`;
      await db`delete from organization where id = ${otra}`;
    }
    console.log("OK: embudo, etapa, trato, movimiento, actividad, recarga, móvil, errores y permisos.");
  } finally {
    await navegador.close();
  }
} finally {
  if (browser) await browser.close();
  await db.end();
  await context.dispose();
  await anonimo.dispose();
  await miembro.dispose();
}
