/**
 * Self-test E2E — Bandeja y cascarón Wachato, en claro y oscuro, a 1440 y
 * 390 px. Guion: tests/e2e/us-diseno-tarjetas.md.
 *
 * Requiere la app viva con WA_MOCK_ENABLED=true. `E2E_EMAIL` / `E2E_PASSWORD`
 * para entrar con una cuenta que ya exista. `CAPTURAS_DIR` para las capturas;
 * `E2E_BROWSER_PATH` permite usar un navegador Chromium del sistema.
 *
 * Uso: node --env-file=<env> scripts/e2e-diseno-061.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "e2e-diseno@vocero.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "password-e2e-diseno";
const SALIDA = process.env.CAPTURAS_DIR ?? ".tmp";
const S = Date.now().toString(36);
const PN = `PN-DIS-${S}`;

let failures = 0;
let checks = 0;
function ok(name, cond, extra = "") {
  checks++;
  if (cond) console.log(`  OK  ${name}`);
  else {
    failures++;
    console.log(`  FALLA  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 15000) {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => null);
    if (v || Date.now() > fin) return v;
    await espera(250);
  }
}
const lum = (rgb) => {
  const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

mkdirSync(SALIDA, { recursive: true });
const browser = await chromium.launch(
  process.env.E2E_BROWSER_PATH ? { executablePath: process.env.E2E_BROWSER_PATH } : {}
);
const base = await browser.newContext();
const errores = [];

try {
  console.log("== Preparación ==");
  let r = await base.request.post(`${BASE}/api/auth/sign-up/email`, {
    headers: { origin: BASE },
    data: { email: EMAIL, password: PASSWORD, name: "Dueña Diseño" },
  });
  if (!r.ok())
    r = await base.request.post(`${BASE}/api/auth/sign-in/email`, {
      headers: { origin: BASE },
      data: { email: EMAIL, password: PASSWORD },
    });
  ok("login", r.ok());
  const sesion = await base.storageState();
  await base.request.put(`${BASE}/api/settings/whatsapp`, { data: { wabaId: "WABA-DIS", phoneNumberId: PN, token: "tok-dis" } });
  const NOMBRE = `Tarjetas ${S}`;
  await base.request.post(`${BASE}/api/dev/wa-mock/inbound`, {
    data: { phoneNumberId: PN, from: `52155563${Math.floor(1000 + Math.random() * 8999)}`, name: NOMBRE, text: `Hola, mira https://ejemplo.mx ${S}` },
  });
  const conv = await hasta(async () =>
    ((await (await base.request.get(`${BASE}/api/conversations`)).json()).conversations ?? []).find((c) => c.contact.name === NOMBRE)
  );
  ok("la conversación existe", Boolean(conv));
  r = await base.request.post(`${BASE}/api/conversations/${conv.id}/messages`, { data: { text: `Claro, te paso la info ${S}` } });
  ok("una respuesta sale", r.ok(), String(r.status()));

  for (const tema of ["light", "dark"]) {
    console.log(`\n== ${tema} · 1440 ==`);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: sesion });
    await ctx.addCookies([{ name: "vocero-theme", value: tema, url: BASE }]);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errores.push(e.message));
    await p.goto(`${BASE}/inbox?conversation=${conv.id}`);
    await hasta(async () => (await p.locator("[data-message-id]").count()) >= 2, 20000);
    await espera(800);

    const m = await p.evaluate(() => {
      const css = (el) => (el ? getComputedStyle(el) : null);
      const lateral = document.querySelector("aside");
      const activa = lateral?.querySelector('[aria-current="page"]');
      const enlaces = [...(lateral?.querySelectorAll("a[href]") ?? [])].map((a) => a.textContent?.trim());
      const burbujaIn = document.querySelector(".burbuja-in");
      const burbujaOut = document.querySelector(".burbuja-out");
      const horaIn = burbujaIn?.querySelector("span.float-right .font-mono");
      const enlaceIn = burbujaIn?.querySelector("a");
      const enviar = document.querySelector('button[aria-label="Enviar"], button[aria-label="Grabar nota de voz"]');
      const caja = document.querySelector('textarea[placeholder^="Escribe"]');
      const capsula = caja?.parentElement;
      return {
        lateral: lateral ? Math.round(lateral.getBoundingClientRect().width) : 0,
        activa: css(activa)?.backgroundColor ?? "",
        activaIcono: css(activa)?.color ?? "",
        enlaces,
        inFondo: css(burbujaIn)?.backgroundColor ?? "",
        inTexto: css(burbujaIn)?.color ?? "",
        inHora: css(horaIn)?.color ?? "",
        inEnlace: css(enlaceIn)?.color ?? "",
        outFondo: css(burbujaOut)?.backgroundColor ?? "",
        outTexto: css(burbujaOut)?.color ?? "",
        enviarRedondo: enviar ? Math.round(enviar.getBoundingClientRect().width) === Math.round(enviar.getBoundingClientRect().height) && parseFloat(css(enviar).borderTopLeftRadius) >= 20 : false,
        enviarFuera: enviar && capsula ? !capsula.contains(enviar) : false,
        capsulaRadio: capsula ? parseFloat(css(capsula).borderTopLeftRadius) : 0,
        desborde: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    ok("AC1 · el lateral mide 228 px", m.lateral === 228, String(m.lateral));
    ok("AC1 · trae las entradas del menú", ["Bandeja", "Pipeline", "Contactos", "Agente", "Laboratorio", "Resultados", "Ajustes"].every((e) => m.enlaces.some((texto) => texto?.startsWith(e))), JSON.stringify(m.enlaces));
    ok("AC1 · la entrada activa se lee", contraste(m.activaIcono, m.activa) >= 4.5, `${m.activa} / ${m.activaIcono}`);
    ok("AC1 · la cabecera muestra la vista", await p.locator("header").first().getByText("Bandeja", { exact: true }).isVisible());
    ok("AC3 · el cliente en burbuja de alto contraste con su texto", contraste(m.inTexto, m.inFondo) >= 7, `${m.inTexto} sobre ${m.inFondo}`);
    ok("AC3 · la hora dentro de la burbuja del cliente se lee (AA)", contraste(m.inHora, m.inFondo) >= 4.5, `${m.inHora} sobre ${m.inFondo}`);
    ok("AC3 · el enlace dentro de la burbuja del cliente se lee (AA)", contraste(m.inEnlace, m.inFondo) >= 4.5, `${m.inEnlace} sobre ${m.inFondo}`);
    ok("AC3 · la respuesta se lee", contraste(m.outTexto, m.outFondo) >= 7, `${m.outTexto} sobre ${m.outFondo}`);
    ok("AC4 · el envío es un botón redondo fuera de la cápsula", m.enviarRedondo && m.enviarFuera, JSON.stringify({ r: m.enviarRedondo, f: m.enviarFuera }));
    ok("AC4 · la caja es una cápsula", m.capsulaRadio >= 20, String(m.capsulaRadio));
    ok("sin desplazamiento horizontal", !m.desborde);

    const menu = p.locator("aside");
    ok(
      "AC2 · la cuenta conserva tema, cerrar sesión y versión",
      (await menu.getByRole("button", { name: /^Tema:/ }).count()) === 1 &&
        (await menu.getByRole("button", { name: "Cerrar sesión" }).count()) === 1 &&
        /v\d+\.\d+/.test(await menu.innerText())
    );
    await p.screenshot({ path: `${SALIDA}/061-cuenta-${tema}.png` });
    await p.screenshot({ path: `${SALIDA}/061-bandeja-1440-${tema}.png` });
    await ctx.close();

    console.log(`\n== ${tema} · 390 ==`);
    const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: sesion });
    await tel.addCookies([{ name: "vocero-theme", value: tema, url: BASE }]);
    const t = await tel.newPage();
    t.on("pageerror", (e) => errores.push(e.message));
    await t.goto(`${BASE}/inbox`);
    await t.getByText(NOMBRE).first().waitFor({ timeout: 20000 });
    ok("AC5 · el lateral está cerrado en el teléfono", !(await t.locator("aside").isVisible()));
    await t.getByRole("button", { name: "Abrir el menú" }).click();
    await espera(300);
    ok("AC5 · el cajón del menú abre", await t.getByRole("link", { name: /Pipeline/ }).first().isVisible());
    ok("AC5 · sin desplazamiento horizontal", await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await t.screenshot({ path: `${SALIDA}/061-cajon-390-${tema}.png` });
    await t.keyboard.press("Escape");
    await t.locator("aside").waitFor({ state: "hidden" });
    ok("AC5 · Escape cierra el menú", !(await t.locator("aside").isVisible()));
    await t.getByText(NOMBRE).first().click();
    await t.locator("[data-message-id]").first().waitFor({ timeout: 15000 });
    await espera(600);
    ok("AC5 · el hilo en el teléfono, sin desborde", await t.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await t.screenshot({ path: `${SALIDA}/061-hilo-390-${tema}.png` });
    await tel.close();
  }
} finally {
  ok("sin errores de la página", errores.length === 0, errores.join(" | "));
  await browser.close();
}

console.log(`\n${checks - failures}/${checks} checks en verde`);
process.exit(failures > 0 ? 1 : 0);
