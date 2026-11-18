/**
 * Self-test de la transcripción opcional (spec 066).
 *
 * Usa exclusivamente wa-mock, un cerebro HTTP local y el proveedor sintético
 * de `/api/dev/transcription-mock`. No se envía audio ni credencial a terceros.
 * La nota se sirve desde el fixture Ogg sintético existente del wa-mock.
 *
 * Requiere una app con WA_MOCK_ENABLED=true, PostgreSQL de E2E migrado,
 * BRAIN_DISPATCH_URL hacia el cerebro falso, y E2E_EMAIL/E2E_PASSWORD,
 * E2E_WA_TOKEN y E2E_TRANSCRIPTION_TOKEN de prueba.
 */
import { request } from "playwright";
import {
  apagarAgente,
  encenderAgente,
  levantarCerebroFalso,
  urlDelDespacho,
} from "./lib/cerebro-falso.mjs";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const WA_TOKEN = process.env.E2E_WA_TOKEN;
const TRANSCRIPTION_TOKEN = process.env.E2E_TRANSCRIPTION_TOKEN;
const BOT_KEY = process.env.BOT_API_KEY ?? "";
const RUN = Math.random().toString(36).slice(2, 8);
const PN = `PN-TRANSCRIPCION-${RUN}`;

if (!EMAIL || !PASSWORD || !WA_TOKEN || !TRANSCRIPTION_TOKEN) {
  console.error(
    "Configura E2E_EMAIL, E2E_PASSWORD, E2E_WA_TOKEN y E2E_TRANSCRIPTION_TOKEN con credenciales exclusivamente de prueba."
  );
  process.exit(2);
}

let failures = 0;
let checks = 0;
let cerebro;
let apiClient;

function ok(name, condition, extra = "") {
  checks++;
  if (condition) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hasta(test, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await test();
    if (value) return value;
    await sleep(150);
  }
  return null;
}

async function api(path, options = {}) {
  const data = options.data ?? options.body;
  const response = await apiClient.fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    ...(data === undefined ? {} : { data }),
    ...(data === undefined
      ? {}
      : { headers: { "content-type": "application/json" } }),
  });
  const json = await response.json().catch(() => null);
  return { res: response, json };
}

async function setup() {
  apiClient = await request.newContext();
  let login = await api("/api/auth/sign-in/email", {
    method: "POST",
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!login.res.ok()) {
    login = await api("/api/auth/sign-up/email", {
      method: "POST",
      data: { email: EMAIL, password: PASSWORD, name: "Prueba de transcripción" },
    });
  }
  ok("sesión E2E autenticada", login.res.ok(), String(login.res.status()));
  if (!login.res.ok()) return false;

  const connection = await api("/api/settings/whatsapp", {
    method: "PUT",
    data: { wabaId: `WABA-${RUN}`, phoneNumberId: PN, token: WA_TOKEN },
  });
  ok("WhatsApp de prueba enlazado al wa-mock", connection.res.ok());
  if (!connection.res.ok()) return false;

  await api("/api/settings/transcription", { method: "DELETE" });
  const providerMock = await api("/api/dev/transcription-mock", {
    method: "DELETE",
  });
  ok("proveedor simulado disponible (sin llamadas externas)", providerMock.res.ok());
  if (!providerMock.res.ok()) return false;
  const enabled = await encenderAgente(api);
  ok("despacho habilitado para la prueba", enabled.res.ok, String(enabled.res.status));
  return enabled.res.ok;
}

async function enviarAudio(nombre, secuencia) {
  const from = `521555${String(Date.now()).slice(-7)}${secuencia}`;
  const response = await api("/api/dev/wa-mock/inbound", {
    method: "POST",
    data: {
      phoneNumberId: PN,
      from,
      name: nombre,
      type: "audio",
      mediaId: `media-audio-transcripcion-${RUN}-${secuencia}`,
      mimeType: "audio/ogg; codecs=opus",
      waMessageId: `wamid.transcripcion.${RUN}.${secuencia}`,
    },
  });
  ok(`nota sintética recibida (${secuencia})`, response.res.ok());
  return response.res.ok();
}

async function despachoDe(nombre, timeout = 20_000) {
  return hasta(
    () =>
      cerebro.estado.recibidos.find(
        (row) => row.evento?.contact?.displayName === nombre && !row.evento?.type
      ),
    timeout
  );
}

async function main() {
  console.log("== Transcripción apagada por defecto ==");
  cerebro = await levantarCerebroFalso({
    base: BASE,
    botKey: BOT_KEY,
    url: urlDelDespacho(),
    responder: "ninguna",
  });
  if (!(await setup())) return;

  const before = (await api("/api/dev/transcription-mock")).json?.solicitudes ?? -1;
  const defaultSettings = await api("/api/settings/transcription");
  ok(
    "sin credencial la transcripción queda apagada",
    defaultSettings.res.ok() && defaultSettings.json?.config === null
  );
  const disabledName = `Sin transcripción ${RUN}`;
  if (!(await enviarAudio(disabledName, 1))) return;
  const disabledDispatch = await despachoDe(disabledName);
  ok("mensaje se despacha con el conector apagado", Boolean(disabledDispatch));
  ok(
    "apagado mantiene el contrato previo (sin marcador)",
    Boolean(disabledDispatch) &&
      !("transcription" in (disabledDispatch.evento.messages.find((m) => m.type === "audio") ?? {}))
  );
  const disabledMock = await api("/api/dev/transcription-mock");
  ok(
    "apagado no contacta al proveedor simulado",
    disabledMock.json?.solicitudes === before
  );

  console.log("\n== Proveedor simulado y camino infeliz ==");
  const configured = await api("/api/settings/transcription", {
    method: "PUT",
    data: {
      enabled: true,
      provider: "openai",
      token: TRANSCRIPTION_TOKEN,
    },
  });
  ok("credencial de prueba guardada y activada", configured.res.ok());
  ok(
    "la API solo expone los últimos cuatro caracteres",
    configured.res.ok() &&
      configured.json?.config?.tokenLast4 === TRANSCRIPTION_TOKEN.slice(-4) &&
      !JSON.stringify(configured.json).includes(TRANSCRIPTION_TOKEN)
  );

  const enabledName = `Con transcripción ${RUN}`;
  if (!(await enviarAudio(enabledName, 2))) return;
  const enabledDispatch = await despachoDe(enabledName);
  const audio = enabledDispatch?.evento.messages.find((m) => m.type === "audio");
  ok(
    "el cerebro recibe el marcador con texto sintético",
    audio?.transcription?.status === "ready" &&
      audio.transcription.text === "Transcripción sintética de prueba."
  );
  ok("el despacho firmado se valida", enabledDispatch?.firmaOk === true);
  const provider = await api("/api/dev/transcription-mock");
  ok(
    "el proveedor simulado solo recibió archivo y modelo",
    provider.json?.solicitudes === before + 1 &&
      JSON.stringify(provider.json?.campos) === JSON.stringify(["file", "model"])
  );
  ok(
    "el token y los datos de contacto no viajan en la solicitud al proveedor",
    !JSON.stringify(provider.json).includes(TRANSCRIPTION_TOKEN) &&
      !JSON.stringify(provider.json).includes(enabledName)
  );
  const inboxMessages = await api(
    `/api/conversations/${enabledDispatch?.evento.conversation.id}/messages`
  );
  const inboxAudio = inboxMessages.json?.messages?.find(
    (message) => message.type === "audio"
  );
  ok(
    "la transcripción no se persiste ni aparece en la Bandeja",
    inboxMessages.res.ok() && inboxAudio?.text === null
  );

  await api("/api/dev/transcription-mock", {
    method: "PATCH",
    data: { modo: "unavailable" },
  });
  const failedName = `Proveedor caído ${RUN}`;
  if (!(await enviarAudio(failedName, 3))) return;
  const failedDispatch = await despachoDe(failedName);
  const failedAudio = failedDispatch?.evento.messages.find((m) => m.type === "audio");
  ok(
    "fallo del proveedor conserva y despacha el mensaje",
    failedAudio?.transcription?.status === "unavailable" &&
      Boolean(failedDispatch?.firmaOk)
  );
  const afterFailure = await api("/api/dev/transcription-mock");
  ok(
    "el fallo del proveedor no reintenta el despacho al cerebro",
    afterFailure.json?.solicitudes === before + 2 &&
      cerebro.de(failedDispatch?.evento.conversation.id).length === 1
  );

  await api("/api/dev/transcription-mock", {
    method: "PATCH",
    data: { modo: "timeout" },
  });
  const timeoutName = `Proveedor lento ${RUN}`;
  if (!(await enviarAudio(timeoutName, 4))) return;
  const timeoutDispatch = await despachoDe(timeoutName, 15_000);
  const timeoutAudio = timeoutDispatch?.evento.messages.find(
    (message) => message.type === "audio"
  );
  ok(
    "el timeout del proveedor degrada sin retener el despacho",
    timeoutAudio?.transcription?.status === "unavailable" &&
      Boolean(timeoutDispatch?.firmaOk)
  );
  const afterTimeout = await api("/api/dev/transcription-mock");
  ok(
    "el intento de timeout queda acotado y no duplica solicitudes",
    afterTimeout.json?.solicitudes === before + 3
  );
}

try {
  await main();
} finally {
  if (apiClient) {
    await api("/api/settings/transcription", { method: "DELETE" }).catch(() => {});
    await apagarAgente(api).catch(() => {});
    await apiClient.dispose();
  }
  await cerebro?.apagar();
  console.log(`\nResultado: ${checks - failures}/${checks} checks`);
}

if (failures) process.exit(1);
