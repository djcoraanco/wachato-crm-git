/** Prueba aislada del avatar privado; requiere app, BD y almacenamiento de pruebas locales. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, unlink, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, request } from "playwright";
import postgres from "postgres";
import sharp from "sharp";

const base = new URL(process.env.WACHATO_TEST_BASE_URL ?? "");
const dbUrl = new URL(process.env.WACHATO_TEST_DB_APP ?? "");
const media = process.env.MEDIA_DIR;
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) ||
    !/^\/wachato_test_app_[a-f0-9]+$/.test(dbUrl.pathname) ||
    !media || path.basename(media) !== "media" || !/^cluster-[a-f0-9]+$/.test(path.basename(path.dirname(media))) ||
    !process.env.WACHATO_TEST_MEDIA_OBSTACULO ||
    await readFile(media, "utf8") !== process.env.WACHATO_TEST_MEDIA_OBSTACULO) {
  throw new Error("Se requiere app, base y almacenamiento aislados con obstáculo propio");
}
const url = base.origin;
const context = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const otro = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const anonimo = await request.newContext({ baseURL: url });
const db = postgres(dbUrl.href, { max: 2 });
const sufijo = randomBytes(5).toString("hex");
const imagen = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#346789" } }).jpeg().toBuffer();
const archivo = { name: "avatar.jpg", mimeType: "image/jpeg", buffer: imagen };
const comprobar = async (respuesta, status, nombre) => {
  assert.equal(respuesta.status(), status, `${nombre}: HTTP ${respuesta.status()} ${await respuesta.text()}`);
  return respuesta;
};
let browser;
try {
  await comprobar(await context.post("/api/auth/sign-up/email", { data: {
    name: "Dueño", email: `avatar-${sufijo}@example.test`, password: "e2e-avatar-ficticio",
  } }), 200, "Registro");
  const contacto = (await (await comprobar(await context.post("/api/contacts", { data: {
    name: "Contacto Avatar", phone: `52155${Math.floor(10000000 + Math.random() * 90000000)}`,
  } }), 201, "Contacto")).json()).contact;
  const ruta = `/api/contacts/${contacto.id}/avatar`;
  const [fila] = await db`select organization_id from contact where id = ${contacto.id}`;
  const org = fila.organization_id;
  await comprobar(await anonimo.get(`${ruta}/image`), 401, "Imagen anónima");
  await comprobar(await context.post(ruta, { data: Buffer.from("no es una imagen") }), 422, "Imagen falsa");
  await comprobar(await context.post(ruta, { data: imagen.subarray(0, 20) }), 422, "Imagen truncada");
  const png = await sharp(imagen).png().toBuffer();
  const controlAnimacion = Buffer.from("000000086163544c000000020000000000000000", "hex");
  const pngAnimado = Buffer.concat([png.subarray(0, 33), controlAnimacion, png.subarray(33)]);
  await comprobar(await context.post(ruta, { data: pngAnimado }), 422, "PNG con animación");
  await comprobar(await context.post(ruta, { data: Buffer.alloc(5 * 1024 * 1024 + 1) }), 413, "Imagen demasiado grande");
  const dimensionesExcesivas = await sharp({ create: {
    width: 4001, height: 4000, channels: 3, background: "#ffffff",
  } }).png().toBuffer();
  await comprobar(await context.post(ruta, { data: dimensionesExcesivas }), 422, "Imagen con demasiados píxeles");
  assert.equal((await (await context.get(ruta)).json()).avatar, null);
  await comprobar(await context.post(ruta, { data: imagen }), 503, "Fallo real del disco");
  assert.equal((await (await context.get(ruta)).json()).avatar.estado, "pendiente");
  await unlink(media);
  await comprobar(await context.delete(ruta), 200, "Retirar carga pendiente");
  assert.equal((await (await context.get(ruta)).json()).avatar, null);

  await comprobar(await context.post("/api/settings/team", { data: {
    name: "Otro", email: `otro-${sufijo}@example.test`, password: "e2e-otro-ficticio",
  } }), 201, "Miembro");
  await comprobar(await otro.post("/api/auth/sign-in/email", { data: {
    email: `otro-${sufijo}@example.test`, password: "e2e-otro-ficticio",
  } }), 200, "Ingreso");
  const otraOrg = `org_aislada_${sufijo}`;
  await db`insert into organization (id, name, slug, created_at) values (${otraOrg}, 'Otra', ${`otra-${sufijo}`}, now())`;
  await db`update member set organization_id = ${otraOrg} where user_id =
    (select id from "user" where email = ${`otro-${sufijo}@example.test`})`;

  browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
  const movil = await browser.newContext({ storageState: await context.storageState(), baseURL: url,
    viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await movil.newPage();
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Perfil", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Perfil de Contacto Avatar" });
  const editor = dialogo.getByRole("region", { name: "Avatar del contacto" });
  await editor.getByLabel("Cargar avatar").setInputFiles({ ...archivo, buffer: Buffer.from("inválido") });
  await editor.getByRole("alert").getByText(/Imagen inválida/).waitFor();
  await editor.getByLabel("Cargar avatar").setInputFiles(archivo);
  await editor.getByText("Avatar guardado.").waitFor();
  const avatar = (await (await context.get(ruta)).json()).avatar;
  assert.equal(avatar.estado, "activo");
  const img = editor.locator("img");
  await img.waitFor();
  await page.waitForFunction((selector) => {
    const imagen = document.querySelector(selector);
    return imagen instanceof HTMLImageElement && imagen.complete && imagen.naturalWidth > 0;
  }, `img[src*="${contacto.id}/avatar/image"]`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const binario = await comprobar(await context.get(`${ruta}/image`), 200, "Imagen autenticada");
  assert.match(binario.headers()["cache-control"], /private.*no-store/);
  assert.equal((await sharp(await binario.body()).metadata()).format, "png");
  for (const [metodo, direccion] of [["get", ruta], ["get", `${ruta}/image`], ["delete", ruta]]) {
    await comprobar(await otro[metodo](direccion), 404, "Otra organización");
  }
  await comprobar(await otro.post(ruta, { data: imagen }), 404, "Carga de otra organización");
  await assert.rejects(db`delete from contact where id = ${contacto.id}`, (error) => error.code === "23503");
  const conversacion = `cv_avatar_${sufijo}`;
  await db`insert into conversation (id, organization_id, contact_id, channel)
    values (${conversacion}, ${org}, ${contacto.id}, 'whatsapp')`;
  const bloqueo = await comprobar(await context.delete(`/api/conversations/${conversacion}?contacto=1`),
    409, "Contacto con avatar");
  assert.equal((await bloqueo.json()).error.code, "avatar_pendiente");
  await comprobar(await context.post("/api/auth/organization/delete", { data: { organizationId: org } }),
    409, "Organización con avatar");

  const segundo = (await (await comprobar(await context.post("/api/contacts", { data: {
    name: "Otro contacto", phone: `52156${Math.floor(10000000 + Math.random() * 90000000)}`,
  } }), 201, "Segundo contacto")).json()).contact;
  const segundaRuta = `/api/contacts/${segundo.id}/avatar`;
  await comprobar(await context.post(segundaRuta, { data: imagen }), 201, "Segundo avatar");
  const fichero = path.join(media, org, avatar.id);
  const respaldo = `${fichero}.respaldo`;
  await rename(fichero, respaldo);
  await mkdir(fichero);
  await editor.getByRole("button", { name: "Eliminar avatar" }).click();
  await editor.getByRole("alert").getByText(/No se pudo eliminar/).waitFor();
  assert.equal((await (await context.get(ruta)).json()).avatar.estado, "eliminando");
  await rm(fichero, { recursive: true });
  await rename(respaldo, fichero);
  await editor.getByRole("button", { name: "Retirar archivo pendiente" }).click();
  await editor.getByText("Avatar eliminado.").waitFor();
  assert.equal((await (await context.get(ruta)).json()).avatar, null);
  await assert.rejects(readFile(fichero), (error) => error.code === "ENOENT");
  await comprobar(await context.get(`${ruta}/image`), 404, "Imagen eliminada");
  await comprobar(await context.get(`${segundaRuta}/image`), 200, "El avatar del otro contacto permanece");
  await comprobar(await context.delete(segundaRuta), 200, "Eliminar segundo avatar");
  await movil.close();
  console.log("OK: avatar móvil, validación, almacenamiento fallido y reintento, aislamiento y eliminación privada.");
} finally {
  if (browser) await browser.close();
  await Promise.all([context.dispose(), otro.dispose(), anonimo.dispose(), db.end()]);
}
