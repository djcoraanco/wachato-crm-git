/**
 * Lanza la prueba comercial en PostgreSQL desechable y Next con distDir propio.
 * WACHATO_TEST_EMBEDDED_ROOT apunta a una instalación local de embedded-postgres.
 */
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { cp, copyFile, mkdir, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

if (process.argv.includes("--servidor")) {
  const { default: next } = await import("next");
  const http = await import("node:http");
  const port = Number(process.env.PORT);
  const app = next({ dev: true, dir: process.env.WACHATO_TEST_PROJECT, hostname: "127.0.0.1", port });
  await app.prepare();
  const server = http.createServer(app.getRequestHandler());
  server.on("upgrade", app.getUpgradeHandler());
  server.listen(port, "127.0.0.1");
} else {
  const root = process.cwd();
  const paquete = process.env.WACHATO_TEST_EMBEDDED_ROOT;
  if (!paquete) throw new Error("Falta WACHATO_TEST_EMBEDDED_ROOT con node_modules/embedded-postgres");
  const native = path.join(paquete, "node_modules", "@embedded-postgres", "windows-x64", "native", "bin");
  const id = randomBytes(6).toString("hex");
  const carpeta = `.e2e-pipeline-${id}`;
  const directorio = path.join(root, carpeta);
  const cluster = path.join(directorio, "postgres");
  const proyecto = path.join(directorio, "app");
  async function puertoLibre() {
    const socket = createServer();
    await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    return port;
  }
  const pgPort = await puertoLibre();
  const appPort = await puertoLibre();
  let postgresProcess;
  let app;
  let sql;
  await mkdir(directorio);
  try {
    await mkdir(proyecto);
    for (const dir of ["src", "public"]) {
      await cp(path.join(root, dir), path.join(proyecto, dir), { recursive: true });
    }
    await symlink(path.join(root, "node_modules"), path.join(proyecto, "node_modules"), "junction");
    for (const file of ["package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "tailwind.config.ts"]) {
      await copyFile(path.join(root, file), path.join(proyecto, file));
    }
    const init = spawnSync(path.join(native, "initdb.exe"),
      [`--pgdata=${cluster}`, "--username=e2e", "--auth=trust", "--encoding=UTF8", "--lc-messages=C"],
      { encoding: "utf8", timeout: 90000 });
    if (init.status !== 0) throw new Error(`Inicialización de PostgreSQL falló: ${init.stderr || init.stdout}`);
    postgresProcess = spawn(path.join(native, "postgres.exe"),
      ["-D", cluster, "-p", String(pgPort), "-h", "127.0.0.1"], { stdio: "ignore" });
    sql = postgres(`postgresql://e2e:e2e-local@127.0.0.1:${pgPort}/postgres`, { max: 1, connect_timeout: 2 });
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await sql`select 1`; ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    if (!ready) throw new Error("No arrancó PostgreSQL aislado");
    const database = process.argv.includes("--campos")
      ? `wachato_test_app_${id}` : `wachato_test_pipeline_${id}`;
    await sql.unsafe(`CREATE DATABASE "${database}"`);
    const url = `http://127.0.0.1:${appPort}`;
    const dbUrl = `postgresql://e2e:e2e-local@127.0.0.1:${pgPort}/${database}`;
    const env = {};
    for (const key of ["PATH", "SystemRoot", "COMSPEC", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const dotEnv = await readFile(path.join(root, ".env"), "utf8").catch(() => "");
    for (const line of dotEnv.split(/\r?\n/)) {
      const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
      if (key) env[key] = "";
    }
    Object.assign(env, {
      NODE_ENV: "development", PORT: String(appPort), APP_BASE_URL: url,
      DATABASE_URL: dbUrl, WACHATO_TEST_DB_APP: dbUrl, WACHATO_TEST_BASE_URL: url,
      WACHATO_TEST_ALLOW_WRITE: "base-vacia",
      BETTER_AUTH_SECRET: "secreto-ficticio-aislado-e2e",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      META_WEBHOOK_VERIFY_TOKEN: "token-ficticio-aislado-e2e",
      WA_MOCK_ENABLED: "true", MEDIA_DIR: path.join(directorio, "media"),
      MIGRATIONS_DIR: path.join(root, "drizzle"),
      WACHATO_TEST_PROJECT: proyecto,
      WACHATO_TEST_CHROME: process.env.WACHATO_TEST_CHROME ?? "",
    });
    const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], { cwd: root, env, encoding: "utf8", timeout: 90000 });
    if (migration.status !== 0) throw new Error(`Migración falló: ${migration.stderr || migration.stdout}`);
    app = spawn(process.execPath, ["scripts/e2e-pipeline-aislado.mjs", "--servidor"], { cwd: root, env, stdio: "inherit" });
    let appReady = false;
    for (let i = 0; i < 120; i++) {
      if (app.exitCode !== null) throw new Error(`Next terminó: ${app.exitCode}`);
      try {
        const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (response.ok && (await response.json()).ok) { appReady = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!appReady) throw new Error("No arrancó la app aislada");
    const guion = process.argv.includes("--campos")
      ? "scripts/e2e-campos-personalizados.mjs"
      : "scripts/e2e-pipeline-comercial.mjs";
    const prueba = spawnSync(process.execPath, [guion],
      { cwd: root, env, stdio: "inherit", timeout: 240000 });
    if (prueba.status !== 0) throw new Error(`Prueba comercial falló: ${prueba.status} ${prueba.error ?? ""}`);
  } finally {
    if (app && app.exitCode === null) {
      const script = [
        "function StopTree([int]$p) {",
        '  $hijos = Get-CimInstance Win32_Process -Filter "ParentProcessId = $p"',
        "  foreach ($hijo in $hijos) { StopTree ([int]$hijo.ProcessId) }",
        "  if (Get-Process -Id $p -ErrorAction SilentlyContinue) { Stop-Process -Id $p -Force -ErrorAction Stop }",
        "}",
        `StopTree ${Number(app.pid)}`,
      ].join("\n");
      const stop = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
      if (stop.status !== 0) throw new Error(`No se pudo detener Next aislado: ${stop.stderr}`);
    }
    if (sql) await sql.end();
    if (postgresProcess && postgresProcess.exitCode === null) {
      const stop = spawnSync(path.join(native, "pg_ctl.exe"), ["-D", cluster, "stop", "-m", "fast", "-w"],
        { encoding: "utf8", timeout: 30000 });
      if (stop.status !== 0) throw new Error("No se pudo detener PostgreSQL aislado");
    }
    await rm(directorio, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
  }
}
