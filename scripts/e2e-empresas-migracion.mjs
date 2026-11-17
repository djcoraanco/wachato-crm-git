/**
 * Verifica la migración de empresas en dos bases locales vacías y desechables.
 * WACHATO_TEST_DB_ANTERIOR y WACHATO_TEST_DB_NUEVA deben apuntar a bases
 * locales distintas cuyo nombre empiece por wachato_test_.
 */
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function urlDePrueba(nombre) {
  const raw = process.env[nombre];
  if (!raw) throw new Error(`${nombre} es obligatoria`);
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/wachato_test_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(`${nombre} debe señalar una base local wachato_test_*`);
  }
  return url;
}

const anterior = urlDePrueba("WACHATO_TEST_DB_ANTERIOR");
const nueva = urlDePrueba("WACHATO_TEST_DB_NUEVA");
if (anterior.href === nueva.href) throw new Error("Se requieren dos bases distintas");

const carpetaMigraciones = path.resolve("drizzle");
const temporal = await mkdtemp(path.join(os.tmpdir(), "wachato-migracion-"));
const vieja = postgres(anterior.href, { max: 1 });
const fresca = postgres(nueva.href, { max: 1 });

async function baseVacia(sql) {
  const [row] = await sql`
    select count(*)::int as cantidad from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  `;
  assert.equal(row.cantidad, 0, "La base de pruebas debe estar vacía");
}

async function rechazaCodigo(promesa, codigo) {
  await assert.rejects(promesa, (error) => error.code === codigo);
}

try {
  await baseVacia(vieja);
  await baseVacia(fresca);
  const journal = JSON.parse(await readFile(path.join(carpetaMigraciones, "meta", "_journal.json"), "utf8"));
  const entradas = journal.entries.filter((entry) => entry.idx <= 25);
  assert.equal(entradas.at(-1)?.idx, 25);
  await mkdir(path.join(temporal, "meta"));
  await writeFile(path.join(temporal, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: entradas }));
  for (const entry of entradas) {
    await copyFile(path.join(carpetaMigraciones, `${entry.tag}.sql`), path.join(temporal, `${entry.tag}.sql`));
  }

  await migrate(drizzle(vieja), { migrationsFolder: temporal });
  await vieja`insert into organization (id, name, created_at) values ('org_a', 'Empresa A', now()), ('org_b', 'Empresa B', now())`;
  await vieja`insert into contact (id, organization_id, wa_identity, name) values ('ct_a', 'org_a', '5215550000001', 'Contacto previo'), ('ct_b', 'org_b', '5215550000002', 'Otro contacto')`;
  await migrate(drizzle(vieja), { migrationsFolder: carpetaMigraciones });
  await migrate(drizzle(vieja), { migrationsFolder: carpetaMigraciones });
  const [contacto] = await vieja`select name, wa_identity from contact where id = 'ct_a' and organization_id = 'org_a'`;
  assert.deepEqual({ ...contacto }, { name: "Contacto previo", wa_identity: "5215550000001" });

  await vieja`insert into company (id, organization_id, name) values ('co_a', 'org_a', 'Matriz'), ('co_b', 'org_b', 'Otra empresa')`;
  await vieja`insert into company (id, organization_id, name, parent_company_id) values ('co_hija', 'org_a', 'Sucursal', 'co_a')`;
  await vieja`insert into company_contact (organization_id, company_id, contact_id) values ('org_a', 'co_a', 'ct_a'), ('org_a', 'co_hija', 'ct_a')`;
  await vieja`insert into contact_profile (organization_id, contact_id, first_name) values ('org_a', 'ct_a', 'Nombre')`;
  await rechazaCodigo(vieja`insert into company_contact (organization_id, company_id, contact_id) values ('org_a', 'co_a', 'ct_a')`, "23505");
  await rechazaCodigo(vieja`insert into company_contact (organization_id, company_id, contact_id) values ('org_a', 'co_a', 'ct_b')`, "23503");
  await rechazaCodigo(vieja`insert into company_contact (organization_id, company_id, contact_id) values ('org_a', 'co_b', 'ct_a')`, "23503");
  await rechazaCodigo(vieja`insert into contact_profile (organization_id, contact_id) values ('org_a', 'ct_b')`, "23503");
  await rechazaCodigo(vieja`insert into company (id, organization_id, name, parent_company_id) values ('co_cruzada', 'org_a', 'Inválida', 'co_b')`, "23503");
  await rechazaCodigo(vieja`insert into company (id, organization_id, name, parent_company_id) values ('co_ciclo', 'org_a', 'Inválida', 'co_ciclo')`, "23514");
  await vieja`insert into custom_field (id, organization_id, entity, key, name, kind) values ('fld_contacto', 'org_a', 'contacto', 'interes', 'Interés', 'texto'), ('fld_empresa', 'org_a', 'empresa', 'rubro', 'Rubro', 'texto')`;
  await vieja`insert into contact_custom_value (organization_id, field_id, contact_id, value) values ('org_a', 'fld_contacto', 'ct_a', '"hola"'::jsonb)`;
  await vieja`insert into company_custom_value (organization_id, field_id, company_id, value) values ('org_a', 'fld_empresa', 'co_a', '"servicios"'::jsonb)`;
  await rechazaCodigo(vieja`insert into contact_custom_value (organization_id, field_id, contact_id, value) values ('org_a', 'fld_contacto', 'ct_b', '"x"'::jsonb)`, "23503");
  await rechazaCodigo(vieja`insert into contact_custom_value (organization_id, field_id, contact_id, value) values ('org_a', 'fld_empresa', 'ct_a', '"x"'::jsonb)`, "23503");
  await rechazaCodigo(vieja`insert into company_custom_value (organization_id, field_id, company_id, value) values ('org_a', 'fld_empresa', 'co_b', '"x"'::jsonb)`, "23503");
  await rechazaCodigo(vieja`insert into contact_custom_value (organization_id, field_id, contact_id, value) values ('org_a', 'fld_contacto', 'ct_a', '"otro"'::jsonb)`, "23505");
  await vieja`insert into sales_pipeline (id, organization_id, name) values ('pl_a', 'org_a', 'Ventas'), ('pl_otro', 'org_a', 'Alianzas'), ('pl_b', 'org_b', 'Otro negocio')`;
  await vieja`insert into sales_pipeline_stage (id, organization_id, pipeline_id, name, position) values ('ps_a', 'org_a', 'pl_a', 'Inicial', 0), ('ps_otro', 'org_a', 'pl_otro', 'Inicial', 0), ('ps_b', 'org_b', 'pl_b', 'Inicial', 0)`;
  await vieja`insert into pipeline_stage (id, organization_id, name, position) values ('st_a', 'org_a', 'Predeterminada', 0)`;
  await vieja`insert into sales_deal (id, organization_id, contact_id, pipeline_id, stage_id, title, amount_cents, currency) values ('deal_a', 'org_a', 'ct_a', 'pl_a', 'ps_a', 'Prueba', 100, 'MXN')`;
  await vieja`insert into sales_deal (id, organization_id, contact_id, legacy_stage_id, title) values ('deal_default', 'org_a', 'ct_a', 'st_a', 'Predeterminado')`;
  await rechazaCodigo(vieja`insert into sales_deal (id, organization_id, contact_id, pipeline_id, stage_id, title) values ('deal_cruce', 'org_a', 'ct_a', 'pl_a', 'ps_otro', 'Inválido')`, "23503");
  await rechazaCodigo(vieja`insert into sales_deal (id, organization_id, contact_id, pipeline_id, stage_id, title) values ('deal_tenant', 'org_a', 'ct_a', 'pl_b', 'ps_b', 'Inválido')`, "23503");
  await rechazaCodigo(vieja`insert into sales_deal (id, organization_id, contact_id, legacy_stage_id, title, currency) values ('deal_moneda', 'org_a', 'ct_a', 'st_a', 'Inválido', 'MXN')`, "23514");
  await rechazaCodigo(vieja`insert into sales_deal (id, organization_id, contact_id, legacy_stage_id, pipeline_id, stage_id, title) values ('deal_doble', 'org_a', 'ct_a', 'st_a', 'pl_a', 'ps_a', 'Inválido')`, "23514");
  await vieja`insert into crm_activity (id, organization_id, deal_id, kind, content) values ('act_a', 'org_a', 'deal_a', 'llamada', 'Prueba')`;
  await rechazaCodigo(vieja`insert into crm_activity (id, organization_id, deal_id, kind, content) values ('act_cruce', 'org_b', 'deal_a', 'llamada', 'Inválido')`, "23503");
  await rechazaCodigo(vieja`insert into crm_activity (id, organization_id, kind, content) values ('act_suelta', 'org_a', 'nota', 'Inválido')`, "23514");
  await vieja`delete from company where id = 'co_hija' and organization_id = 'org_a'`;
  const [restantes] = await vieja`select count(*)::int as cantidad from company_contact where organization_id = 'org_a' and contact_id = 'ct_a'`;
  assert.equal(restantes.cantidad, 1);
  await migrate(drizzle(fresca), { migrationsFolder: carpetaMigraciones });
  await migrate(drizzle(fresca), { migrationsFolder: carpetaMigraciones });
  console.log("OK: instalación nueva, actualización, reejecución y aislamiento de empresas y campos.");
} finally {
  await vieja.end();
  await fresca.end();
  await rm(temporal, { recursive: true, force: true });
}
