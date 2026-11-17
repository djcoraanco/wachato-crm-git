/**
 * Prueba API de campos sobre una app de pruebas local con base vacía y mocks.
 * La variable WACHATO_TEST_BASE_URL es obligatoria y solo admite loopback.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { chromium, request } from "playwright";
import postgres from "postgres";
import { probarExportacion } from "./e2e-exportar-contactos.mjs";

const base = new URL(process.env.WACHATO_TEST_BASE_URL ?? "");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("WACHATO_TEST_BASE_URL debe señalar una aplicación local de pruebas");
}
const url = base.origin;
const context = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const anonimo = await request.newContext({ baseURL: url });
const miembro = await request.newContext({ baseURL: url, extraHTTPHeaders: { origin: url } });
const suffix = randomBytes(5).toString("hex");
let organizacionId;

async function esperaStatus(response, esperado, nombre) {
  assert.equal(response.status(), esperado, `${nombre}: HTTP ${response.status()}`);
  return response;
}

try {
  await esperaStatus(await anonimo.get("/api/custom-fields"), 401, "Sin sesión");
  await esperaStatus(await context.post("/api/auth/sign-up/email", {
    data: { email: `campos-${suffix}@example.test`, password: "e2e-campos-ficticio", name: "Prueba Campos" },
  }), 200, "Registro");
  const contactoResp = await esperaStatus(await context.post("/api/contacts", {
    data: { name: "Contacto de prueba", phone: `52155${Math.floor(10000000 + Math.random() * 90000000)}` },
  }), 201, "Contacto");
  const contacto = (await contactoResp.json()).contact;
  await esperaStatus(await context.patch(`/api/contacts/${contacto.id}/profile`, {
    data: { birthDate: "2023-02-29" },
  }), 422, "Rechazar fecha inválida del perfil");
  await esperaStatus(await context.patch(`/api/contacts/${contacto.id}/profile`, {
    data: { avatarAssetId: "ma_inexistente" },
  }), 422, "Rechazar avatar ajeno o inexistente");
  const consentimiento = { granted: true, recordedAt: "2024-01-01T00:00:00Z" };
  await esperaStatus(await context.patch(`/api/contacts/${contacto.id}/profile`, {
    data: { firstName: "Prueba", lastName: "Ejemplo", emails: ["persona@example.test"],
      phones: ["+52 55 1234 5678"], consents: { whatsapp: consentimiento } },
  }), 200, "Guardar perfil de contacto");
  await esperaStatus(await context.patch(`/api/contacts/${contacto.id}/profile`, {
    data: { consents: { email: { granted: false, recordedAt: "2024-01-02T00:00:00Z" } } },
  }), 200, "Agregar consentimiento sin borrar el anterior");
  const perfil = (await (await esperaStatus(await context.get(`/api/contacts/${contacto.id}/profile`),
    200, "Consultar perfil")).json()).perfil;
  assert.equal(perfil.firstName, "Prueba");
  assert.deepEqual(perfil.consents.whatsapp, consentimiento);
  assert.equal(perfil.consents.email.granted, false);
  const empresaUno = (await (await esperaStatus(await context.post("/api/crm/companies", {
    data: { name: `Matriz ${suffix}`, taxId: "RFC-prueba" },
  }), 201, "Crear empresa")).json()).empresa;
  const empresaDos = (await (await esperaStatus(await context.post("/api/crm/companies", {
    data: { name: `Sucursal ${suffix}` },
  }), 201, "Crear segunda empresa")).json()).empresa;
  const ciclos = await Promise.all([
    context.patch(`/api/crm/companies/${empresaUno.id}`, { data: { parentCompanyId: empresaDos.id } }),
    context.patch(`/api/crm/companies/${empresaDos.id}`, { data: { parentCompanyId: empresaUno.id } }),
  ]);
  assert.deepEqual(ciclos.map((respuesta) => respuesta.status()).sort(), [200, 422]);
  for (const empresa of [empresaUno, empresaDos]) {
    await esperaStatus(await context.post(`/api/crm/companies/${empresa.id}/contacts`, {
      data: { contactId: contacto.id },
    }), 200, "Vincular contacto a empresa");
    const detalle = await esperaStatus(await context.get(`/api/crm/companies/${empresa.id}`), 200, "Consultar empresa");
    assert.ok((await detalle.json()).empresa.contactos.some((item) => item.id === contacto.id));
    await esperaStatus(await context.delete(`/api/crm/companies/${empresa.id}`), 409, "No eliminar empresa con vínculos");
  }
  await esperaStatus(await context.delete(`/api/crm/companies/${empresaUno.id}/contacts`, {
    data: { contactId: contacto.id },
  }), 200, "Desvincular una empresa");
  const vinculoRestante = await (await context.get(`/api/crm/companies/${empresaDos.id}`)).json();
  assert.ok(vinculoRestante.empresa.contactos.some((item) => item.id === contacto.id));
  await esperaStatus(await anonimo.get("/api/crm/companies"), 401, "Empresas sin sesión");
  if (process.env.WACHATO_TEST_CHROME) {
    const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
    const navegador = await browser.newContext({
      storageState: await context.storageState(), baseURL: url, viewport: { width: 390, height: 844 },
    });
    try {
      const page = await navegador.newPage();
      await page.goto("/contacts");
      const rutaPerfil = `**/api/contacts/${contacto.id}/profile`;
      await page.route(rutaPerfil, (route) => route.abort());
      await page.getByRole("button", { name: "Perfil", exact: true }).click();
      const dialogoSinConexion = page.getByRole("dialog", { name: "Perfil de Contacto de prueba" });
      await dialogoSinConexion.getByRole("alert").waitFor();
      assert.equal(await dialogoSinConexion.getByRole("button", { name: "Guardar perfil" }).isDisabled(), true);
      await dialogoSinConexion.getByRole("button", { name: "Cerrar" }).click();
      await page.unroute(rutaPerfil);
      await page.getByRole("button", { name: "Perfil", exact: true }).click();
      const dialogoPerfil = page.getByRole("dialog", { name: "Perfil de Contacto de prueba" });
      await dialogoPerfil.getByLabel("Apellidos").waitFor();
      assert.equal(await dialogoPerfil.getByLabel("Apellidos").inputValue(), "Ejemplo");
      await dialogoPerfil.getByLabel("Correos, uno por línea").fill("correo inválido");
      const rechazo = page.waitForResponse((response) =>
        response.url().endsWith(`/api/contacts/${contacto.id}/profile`) && response.request().method() === "PATCH");
      await dialogoPerfil.getByRole("button", { name: "Guardar perfil" }).click();
      assert.equal((await rechazo).status(), 422);
      await dialogoPerfil.getByRole("alert").waitFor();
      await dialogoPerfil.getByLabel("Correos, uno por línea").fill("nuevo@example.test");
      await dialogoPerfil.getByLabel("Apellidos").fill("Apellido guardado");
      await dialogoPerfil.getByRole("button", { name: "Guardar perfil" }).click();
      await dialogoPerfil.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Perfil", exact: true }).click();
      await dialogoPerfil.getByLabel("Apellidos").waitFor();
      assert.equal(await dialogoPerfil.getByLabel("Apellidos").inputValue(), "Apellido guardado");
      await dialogoPerfil.getByRole("button", { name: "Cerrar" }).click();
      await page.getByRole("button", { name: "Empresas", exact: true }).click();
      await page.getByLabel("Razón social").fill(`Interfaz ${suffix}`);
      await page.getByLabel("Ciudad").fill("Ciudad de prueba");
      const guardado = page.waitForResponse((response) =>
        response.url().endsWith("/api/crm/companies") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Guardar", exact: true }).click();
      assert.equal((await guardado).status(), 201);
      await page.getByRole("heading", { name: "Contactos vinculados" }).waitFor();
      await page.getByLabel("Buscar contacto para vincular").fill("Contacto de prueba");
      await page.getByRole("button", { name: "Vincular", exact: true }).click();
      await page.getByRole("button", { name: "Desvincular", exact: true }).waitFor();
      await page.reload();
      await page.getByRole("button", { name: "Empresas", exact: true }).click();
      await page.getByRole("button", { name: `Interfaz ${suffix}` }).click();
      await page.getByRole("heading", { name: "Editar empresa" }).waitFor();
      assert.equal(await page.getByLabel("Ciudad").inputValue(), "Ciudad de prueba");
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: "Eliminar empresa" }).click();
      await page.getByRole("alert").getByText(/tiene sucursales, contactos o campos personalizados/).waitFor();
      await page.getByRole("button", { name: "Desvincular", exact: true }).click();
      await page.getByText("Sin contactos vinculados.").waitFor();
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: "Eliminar empresa" }).click();
      await page.getByRole("heading", { name: "Nueva empresa" }).waitFor();
    } finally {
      await navegador.close();
      await browser.close();
    }
  }
  const definicion = { entidad: "contacto", clave: "peso", nombre: "Peso", tipo: "numero", opciones: [] };
  const campoResp = await esperaStatus(await context.post("/api/custom-fields", { data: definicion }), 201, "Campo");
  const campo = (await campoResp.json()).campo;
  await esperaStatus(await context.post("/api/custom-fields", { data: definicion }), 409, "Clave duplicada");
  const valores = `/api/custom-fields/${campo.id}/values`;
  await esperaStatus(await context.put(valores, { data: { entidadId: contacto.id, valor: "12" } }), 422, "Valor inválido");
  await esperaStatus(await context.put(valores, { data: { entidadId: "ct_inexistente", valor: 12 } }), 404, "Contacto inexistente");
  await esperaStatus(await context.put(valores, { data: { entidadId: contacto.id, valor: 12 } }), 200, "Guardar valor");
  const listado = await esperaStatus(await context.get(valores), 200, "Consultar valor");
  assert.deepEqual((await listado.json()).valores, [{ entidadId: contacto.id, valor: 12 }]);

  const campoArchivoResp = await esperaStatus(await context.post("/api/custom-fields", {
    data: { entidad: "contacto", clave: "documento", nombre: "Documento", tipo: "archivo", opciones: [] },
  }), 201, "Campo archivo");
  const campoArchivo = (await campoArchivoResp.json()).campo;
  if (process.env.WACHATO_TEST_DB_APP) {
    const dbUrl = new URL(process.env.WACHATO_TEST_DB_APP);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) ||
        !/^\/wachato_test_app_[a-f0-9]+$/.test(dbUrl.pathname)) {
      throw new Error("WACHATO_TEST_DB_APP debe ser una base local de pruebas aislada");
    }
    if (process.env.WACHATO_TEST_MEDIA_OBSTACULO) {
      const ruta = process.env.MEDIA_DIR;
      if (!ruta || path.basename(ruta) !== "media" ||
          !/^cluster-[a-f0-9]+$/.test(path.basename(path.dirname(ruta))) ||
          await readFile(ruta, "utf8") !== process.env.WACHATO_TEST_MEDIA_OBSTACULO) {
        throw new Error("El obstáculo de almacenamiento no pertenece a la prueba aislada");
      }
      await esperaStatus(await context.post("/api/custom-fields/files", {
        data: Buffer.from("carga interrumpida"),
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": "interrumpido.txt",
          "x-campo-id": campoArchivo.id,
        },
      }), 500, "Error real al guardar el archivo");
      const respuesta = await esperaStatus(
        await context.get(`/api/custom-fields/files?campoId=${campoArchivo.id}`), 200, "Carga fallida conservada"
      );
      const pendientes = (await respuesta.json()).archivos.filter((item) => item.estado === "pendiente");
      assert.equal(pendientes.length, 1);
      await unlink(ruta);
      await esperaStatus(await context.delete(`/api/custom-fields/files/${pendientes[0].id}`), 200, "Recuperar carga fallida");
    }
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      const [fila] = await db`select organization_id, entity from custom_field where id = ${campoArchivo.id}`;
      assert.ok(fila);
      organizacionId = fila.organization_id;
      const pendiente = `cf_${randomBytes(10).toString("hex")}`;
      const disco = createHash("sha256").update(path.resolve(process.env.MEDIA_DIR)).digest("hex");
      await db`insert into custom_field_file (id, organization_id, name, size, field_id, field_entity, upload_pending, storage_recorded, disk_fingerprint)
        values (${pendiente}, ${fila.organization_id}, 'carga interrumpida', 1, ${campoArchivo.id}, ${fila.entity}, true, true, ${disco})`;
      const respuesta = await esperaStatus(
        await context.get(`/api/custom-fields/files?campoId=${campoArchivo.id}`), 200, "Listar carga interrumpida"
      );
      assert.equal((await respuesta.json()).archivos.find((item) => item.id === pendiente)?.estado, "pendiente");
      await esperaStatus(await context.get(`/api/custom-fields/files/${pendiente}`), 404, "No descargar carga pendiente");
      await esperaStatus(await context.put(`/api/custom-fields/${campoArchivo.id}/values`, {
        data: { entidadId: contacto.id, valor: { id: pendiente } },
      }), 404, "No vincular carga pendiente");
      await esperaStatus(await context.delete(`/api/custom-fields/files/${pendiente}`), 200, "Retirar carga pendiente");
    } finally {
      await db.end();
    }
  }
  const datos = Buffer.from("archivo de prueba");
  const carga = await esperaStatus(await context.post("/api/custom-fields/files", {
    data: datos,
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent("prueba á.txt"),
      "x-campo-id": campoArchivo.id,
    },
  }), 201, "Cargar archivo");
  const archivo = (await carga.json()).archivo;
  if (organizacionId) {
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      await assert.rejects(db`delete from organization where id = ${organizacionId}`, (error) => error.code === "23503");
      const [lead] = await db`select id, stage_id from lead where organization_id = ${organizacionId} and contact_id = ${contacto.id}`;
      assert.ok(lead);
      const [destino] = await db`select id from pipeline_stage where organization_id = ${organizacionId} and id <> ${lead.stage_id} limit 1`;
      assert.ok(destino);
      const trato = `deal_prueba_${suffix}`;
      await db`insert into sales_deal (id, organization_id, contact_id, legacy_stage_id, title)
        values (${trato}, ${organizacionId}, ${contacto.id}, ${lead.stage_id}, 'Prueba')`;
      await esperaStatus(await context.delete(`/api/pipeline/stages/${lead.stage_id}?moveTo=${destino.id}`),
        409, "No eliminar etapa con tratos adicionales");
      const [despues] = await db`select stage_id from lead where organization_id = ${organizacionId} and id = ${lead.id}`;
      assert.equal(despues.stage_id, lead.stage_id);
      await db`delete from sales_deal where id = ${trato} and organization_id = ${organizacionId}`;
    } finally {
      await db.end();
    }
    const borradoOrganizacion = await context.post("/api/auth/organization/delete", {
      data: { organizationId: organizacionId },
    });
    await esperaStatus(borradoOrganizacion, 409, "No eliminar organización con archivos");
  }
  const archivosPrivados = await esperaStatus(
    await context.get(`/api/custom-fields/files?campoId=${campoArchivo.id}`), 200, "Listar archivos"
  );
  assert.deepEqual((await archivosPrivados.json()).archivos.map((item) => item.id), [archivo.id]);
  await esperaStatus(await context.put(`/api/custom-fields/${campoArchivo.id}/values`, {
    data: { entidadId: contacto.id, valor: { id: archivo.id } },
  }), 200, "Vincular archivo");
  const descarga = await esperaStatus(await context.get(`/api/custom-fields/files/${archivo.id}`), 200, "Descargar archivo");
  assert.deepEqual(await descarga.body(), datos);
  assert.match(descarga.headers()["content-disposition"], /^attachment;/);
  await esperaStatus(await anonimo.get(`/api/custom-fields/files/${archivo.id}`), 401, "Archivo sin sesión");
  const correoMiembro = `miembro-${suffix}@example.test`;
  await esperaStatus(await context.post("/api/settings/team", {
    data: { name: "Miembro de prueba", email: correoMiembro, password: "e2e-miembro-ficticio" },
  }), 201, "Crear miembro");
  await esperaStatus(await miembro.post("/api/auth/sign-in/email", {
    data: { email: correoMiembro, password: "e2e-miembro-ficticio" },
  }), 200, "Ingreso miembro");
  const camposMiembro = await esperaStatus(await miembro.get("/api/custom-fields"), 200, "Campos del miembro");
  assert.equal((await camposMiembro.json()).campos.length, 0);
  await esperaStatus(await miembro.get(valores), 404, "Campo privado");
  await esperaStatus(await miembro.get(`/api/custom-fields/files/${archivo.id}`), 404, "Archivo privado");
  await esperaStatus(await miembro.get(`/api/custom-fields/files?campoId=${campoArchivo.id}`), 404, "Lista privada");
  await esperaStatus(await miembro.delete(`/api/custom-fields/files/${archivo.id}`), 404, "Borrado privado");
  await esperaStatus(await miembro.put(valores, { data: { entidadId: contacto.id, valor: 1 } }), 404, "Escritura privada");
  await esperaStatus(await miembro.post("/api/custom-fields", { data: definicion }), 403, "Miembro no configura");
  const compartidoResp = await esperaStatus(await context.post("/api/custom-fields", {
    data: { entidad: "contacto", clave: "documento_equipo", nombre: "Documento equipo", tipo: "archivo", opciones: [], visibilidad: "equipo" },
  }), 201, "Campo compartido");
  const compartido = (await compartidoResp.json()).campo;
  const cargaMiembro = await esperaStatus(await miembro.post("/api/custom-fields/files", {
    data: datos,
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": encodeURIComponent("equipo.txt"),
      "x-campo-id": compartido.id,
    },
  }), 201, "Carga del equipo");
  const archivoEquipo = (await cargaMiembro.json()).archivo;
  await esperaStatus(await miembro.put(`/api/custom-fields/${compartido.id}/values`, {
    data: { entidadId: contacto.id, valor: { id: archivoEquipo.id } },
  }), 200, "Guardar campo compartido");
  await esperaStatus(await miembro.get(`/api/custom-fields/files/${archivoEquipo.id}`), 200, "Descargar archivo compartido");
  await esperaStatus(await miembro.put(`/api/custom-fields/${compartido.id}/values`, {
    data: { entidadId: contacto.id, valor: { id: archivo.id } },
  }), 404, "No vincular archivo de otro campo");
  await esperaStatus(await context.patch(`/api/custom-fields/${compartido.id}`, {
    data: { visibilidad: "privado" },
  }), 200, "Retirar acceso");
  await esperaStatus(await miembro.get(`/api/custom-fields/${compartido.id}/values`), 404, "Valor tras retirar acceso");
  await esperaStatus(await miembro.get(`/api/custom-fields/files/${archivoEquipo.id}`), 404, "Archivo tras retirar acceso");
  await esperaStatus(await miembro.delete(`/api/custom-fields/files/${archivoEquipo.id}`), 404, "Borrado tras retirar acceso");
  await esperaStatus(await context.delete(`/api/custom-fields/files/${archivo.id}`), 409, "No borrar archivo en uso");
  await esperaStatus(await context.delete(`/api/custom-fields/${campoArchivo.id}`), 409, "No borrar campo en uso");
  await esperaStatus(await context.delete(`/api/custom-fields/${campoArchivo.id}/values`, {
    data: { entidadId: contacto.id },
  }), 200, "Borrar valor");
  if (organizacionId) {
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      await db`update custom_field_file set disk_fingerprint = 'otra-ruta' where id = ${archivo.id} and organization_id = ${organizacionId}`;
      await esperaStatus(await context.delete(`/api/custom-fields/files/${archivo.id}`), 409, "No borrar sin disco original");
      const disco = createHash("sha256").update(path.resolve(process.env.MEDIA_DIR)).digest("hex");
      await db`update custom_field_file set disk_fingerprint = ${disco}, storage_recorded = false where id = ${archivo.id} and organization_id = ${organizacionId}`;
      await esperaStatus(await context.delete(`/api/custom-fields/files/${archivo.id}`), 409, "No borrar archivo sin ubicación conocida");
      await esperaStatus(await context.delete(`/api/custom-fields/files/${archivo.id}?confirmarAlmacenAnterior=true`), 200, "Confirmar almacenes originales");
    } finally {
      await db.end();
    }
  } else {
    await esperaStatus(await context.delete(`/api/custom-fields/files/${archivo.id}`), 200, "Borrar archivo liberado");
  }
  await esperaStatus(await context.get(`/api/custom-fields/files/${archivo.id}`), 404, "Archivo borrado");
  const listaVacia = await esperaStatus(
    await context.get(`/api/custom-fields/files?campoId=${campoArchivo.id}`), 200, "Listar tras borrar"
  );
  assert.deepEqual((await listaVacia.json()).archivos, []);
  await esperaStatus(await context.delete(`/api/custom-fields/${campoArchivo.id}`), 200, "Borrar campo liberado");
  const seleccionResp = await esperaStatus(await context.post("/api/custom-fields", {
    data: { entidad: "contacto", clave: "opcion", nombre: "Opción", tipo: "select", opciones: ["uno", "dos"] },
  }), 201, "Campo de selección");
  const seleccion = (await seleccionResp.json()).campo;
  await esperaStatus(await context.put(`/api/custom-fields/${seleccion.id}/values`, {
    data: { entidadId: contacto.id, valor: "uno" },
  }), 200, "Guardar selección");
  await esperaStatus(await context.patch(`/api/custom-fields/${seleccion.id}`, {
    data: { opciones: ["dos"] },
  }), 409, "No invalidar opciones en uso");
  const primerEmbudo = (await (await esperaStatus(await context.post("/api/crm/pipelines", {
    data: { nombre: `Embudo ${suffix}` },
  }), 201, "Crear embudo")).json()).embudo;
  const segundoEmbudo = (await (await esperaStatus(await context.post("/api/crm/pipelines", {
    data: { nombre: `Otro ${suffix}` },
  }), 201, "Crear segundo embudo")).json()).embudo;
  const inicial = (await (await esperaStatus(await context.get(`/api/crm/pipelines/${primerEmbudo.id}/board`),
    200, "Tablero adicional")).json()).etapas[0];
  const etapaExtra = (await (await esperaStatus(await context.post(`/api/crm/pipelines/${primerEmbudo.id}/stages`, {
    data: { nombre: "Propuesta" },
  }), 201, "Crear etapa adicional")).json()).etapa;
  const etapaAjena = (await (await esperaStatus(await context.get(`/api/crm/pipelines/${segundoEmbudo.id}/board`),
    200, "Segundo tablero")).json()).etapas[0];
  await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
    data: { nombre: "Propuesta actualizada", posicion: 2 },
  }), 200, "Editar etapa adicional");
  if (process.env.ATRIBUCION === "on" && organizacionId) {
    await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
      data: { eventoMeta: "Contact" },
    }), 422, "Rechazar evento no admitido por Meta");
    await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
      data: { eventoMeta: "LeadSubmitted" },
    }), 200, "Configurar evento de Meta en etapa adicional");
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      await db`insert into conversation (id, organization_id, contact_id, channel)
        values (${'cv_capi_' + suffix}, ${organizacionId}, ${contacto.id}, 'whatsapp')
        on conflict do nothing`;
    } finally {
      await db.end();
    }
  } else {
    await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
      data: { eventoMeta: "LeadSubmitted" },
    }), 404, "La atribución apagada no expone configuración de evento");
    if (organizacionId) {
      const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
      try {
        await db`update sales_pipeline_stage set meta_event = 'LeadSubmitted' where id = ${etapaExtra.id}`;
        const editada = await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
          data: { nombre: "Propuesta sin atribución" },
        }), 200, "Editar etapa con atribución apagada");
        assert.equal("eventoMeta" in (await editada.json()).etapa, false);
      } finally {
        await db.end();
      }
    }
  }
  await esperaStatus(await context.delete(`/api/crm/pipelines/${segundoEmbudo.id}/stages/${etapaAjena.id}`),
    409, "No eliminar la última etapa");
  const datosTrato = {
    titulo: "Negociación", contactoId: contacto.id, embudoId: primerEmbudo.id, etapaId: inicial.id,
    monto: { centavos: 12345, moneda: "MXN" },
  };
  await esperaStatus(await context.post("/api/crm/deals", {
    data: { ...datosTrato, etapaId: etapaAjena.id },
  }), 422, "No crear trato en etapa de otro embudo");
  const trato = (await (await esperaStatus(await context.post("/api/crm/deals", {
    data: datosTrato,
  }), 201, "Crear trato")).json()).trato;
  await esperaStatus(await context.delete(`/api/crm/pipelines/${primerEmbudo.id}/stages/${inicial.id}`),
    409, "No eliminar etapa con tratos");
  await esperaStatus(await context.patch(`/api/crm/deals/${trato.id}`, {
    data: { etapaId: etapaAjena.id },
  }), 422, "No mover trato a otro embudo");
  await esperaStatus(await context.patch(`/api/crm/deals/${trato.id}`, {
    data: { etapaId: etapaExtra.id, monto: { centavos: 25000, moneda: "USD" } },
  }), 200, "Mover y editar trato");
  if (process.env.ATRIBUCION === "on" && organizacionId) {
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      const eventos = await db`select event_name, status from conversion_event
        where organization_id = ${organizacionId} and event_name = 'LeadSubmitted'`;
      assert.deepEqual(eventos.map(({ event_name, status }) => [event_name, status]),
        [["LeadSubmitted", "skipped"]]);
    } finally {
      await db.end();
    }
    await esperaStatus(await context.patch(`/api/crm/deals/${trato.id}`, {
      data: { etapaId: etapaExtra.id },
    }), 200, "No repetir evento al permanecer en la etapa");
  }
  const tablero = await esperaStatus(await context.get(`/api/crm/pipelines/${primerEmbudo.id}/board`), 200, "Consultar trato");
  assert.deepEqual((await tablero.json()).tratos.map((item) => [item.id, item.etapaId, item.monto]),
    [[trato.id, etapaExtra.id, { centavos: 25000, moneda: "USD" }]]);
  await esperaStatus(await context.delete(`/api/crm/pipelines/${primerEmbudo.id}/stages/${inicial.id}`),
    200, "Eliminar etapa vacía");
  const principal = await esperaStatus(await context.get("/api/pipeline/board"), 200, "Tablero principal previo");
  const principalData = await principal.json();
  assert.ok(principalData.leads.some((lead) => lead.contact.id === contacto.id));
  const etapaPrincipal = principalData.stages.find((etapa) => etapa.kind === "open");
  assert.ok(etapaPrincipal);
  const tratoPrincipal = (await (await esperaStatus(await context.post("/api/crm/deals", {
    data: { titulo: "Trato adicional", contactoId: contacto.id,
      embudoId: "predeterminado", etapaId: etapaPrincipal.id },
  }), 201, "Crear trato en embudo principal")).json()).trato;
  const principalAdicional = await esperaStatus(await context.get("/api/crm/pipelines/predeterminado/board"), 200, "Tratos del principal");
  assert.ok((await principalAdicional.json()).tratos.some((item) => item.id === tratoPrincipal.id));
  await esperaStatus(await context.post("/api/crm/activities", {
    data: { tratoId: trato.id, tipo: "llamada", contenido: "Llamada de prueba" },
  }), 201, "Registrar actividad");
  if (process.env.ATRIBUCION === "on" && organizacionId) {
    const bloqueo = await esperaStatus(await context.delete(`/api/conversations/cv_capi_${suffix}?contacto=1`),
      409, "No eliminar contacto con datos comerciales");
    assert.equal((await bloqueo.json()).error.code, "datos_comerciales");
    await esperaStatus(await context.get(`/api/contacts/${contacto.id}`), 200, "Contacto conservado");
  }
  const actividades = await esperaStatus(await context.get(`/api/crm/activities?contactoId=${contacto.id}`), 200, "Consultar actividad");
  assert.equal((await actividades.json()).actividades[0].content, "Llamada de prueba");
  await esperaStatus(await context.post("/api/crm/activities", {
    data: { tipo: "nota", contenido: "Sin vínculo" },
  }), 422, "Rechazar actividad sin vínculo");
  const casosCamposTrato = [
    { tipo: "texto", valor: "Preferencia", invalido: 12 },
    { tipo: "numero", valor: 12.5, invalido: "12.5" },
    { tipo: "moneda", valor: { centavos: 12345, moneda: "MXN" }, invalido: { centavos: 1.2, moneda: "MXN" } },
    { tipo: "fecha", valor: "2024-02-29", invalido: "2023-02-29" },
    { tipo: "booleano", valor: true, invalido: "true" },
    { tipo: "select", opciones: ["uno", "dos"], valor: "uno", invalido: "otro" },
    { tipo: "multiselect", opciones: ["uno", "dos"], valor: ["uno", "dos"], invalido: ["otro"] },
    { tipo: "json", valor: { detalle: ["dato", 1] }, invalido: "a".repeat(17000) },
  ];
  for (const caso of casosCamposTrato) {
    const creado = await esperaStatus(await context.post("/api/crm/deal-fields", {
      data: { entidad: "trato", clave: `prueba_${caso.tipo}`, nombre: caso.tipo,
        tipo: caso.tipo, opciones: caso.opciones ?? [] },
    }), 201, `Crear campo de trato ${caso.tipo}`);
    const id = (await creado.json()).campo.id;
    await esperaStatus(await context.put(`/api/crm/deal-fields/${id}/values`, {
      data: { entidadId: trato.id, valor: caso.invalido },
    }), 422, `Rechazar ${caso.tipo} inválido`);
    await esperaStatus(await context.put(`/api/crm/deal-fields/${id}/values`, {
      data: { entidadId: trato.id, valor: caso.valor },
    }), 200, `Guardar ${caso.tipo}`);
    const valoresTrato = await esperaStatus(await context.get(`/api/crm/deal-fields/${id}/values`),
      200, `Leer ${caso.tipo}`);
    assert.deepEqual((await valoresTrato.json()).valores, [{ entidadId: trato.id, valor: caso.valor }]);
    await esperaStatus(await miembro.get(`/api/crm/deal-fields/${id}/values`), 404, `Proteger ${caso.tipo} privado`);
  }
  const campoTrato = (await (await esperaStatus(await context.post("/api/crm/deal-fields", {
    data: { entidad: "trato", clave: "documento", nombre: "Documento", tipo: "archivo", opciones: [] },
  }), 201, "Crear campo de trato")).json()).campo;
  const cargaTrato = await esperaStatus(await context.post("/api/crm/deal-fields/files", {
    data: datos,
    headers: {
      "content-type": "application/octet-stream", "x-file-name": "trato.txt", "x-campo-id": campoTrato.id,
    },
  }), 201, "Cargar archivo de trato");
  const archivoTrato = (await cargaTrato.json()).archivo;
  await esperaStatus(await miembro.get(`/api/crm/deal-fields/files/${archivoTrato.id}`), 404, "Archivo de trato privado");
  await esperaStatus(await context.put(`/api/crm/deal-fields/${campoTrato.id}/values`, {
    data: { entidadId: trato.id, valor: { id: archivoTrato.id } },
  }), 200, "Guardar archivo de trato");
  await esperaStatus(await context.delete(`/api/custom-fields/files/${archivoTrato.id}`), 409, "No eludir el borrado de trato");
  await esperaStatus(await context.delete(`/api/crm/deal-fields/files/${archivoTrato.id}`), 409, "No borrar archivo de trato en uso");
  await esperaStatus(await context.patch(`/api/crm/deal-fields/${campoTrato.id}`, {
    data: { visibilidad: "equipo" },
  }), 200, "Compartir campo de trato");
  assert.deepEqual(await (await esperaStatus(await miembro.get(`/api/crm/deal-fields/files/${archivoTrato.id}`),
    200, "Descargar archivo de trato compartido")).body(), datos);
  await esperaStatus(await context.patch(`/api/crm/deal-fields/${campoTrato.id}`, {
    data: { visibilidad: "privado" },
  }), 200, "Retirar acceso al campo de trato");
  await esperaStatus(await miembro.get(`/api/crm/deal-fields/files/${archivoTrato.id}`), 404, "Archivo de trato tras revocar");
  await esperaStatus(await context.delete(`/api/crm/deal-fields/${campoTrato.id}/values`, {
    data: { entidadId: trato.id },
  }), 200, "Retirar valor de trato");
  await esperaStatus(await context.delete(`/api/crm/deal-fields/files/${archivoTrato.id}`), 200, "Retirar archivo de trato");
  await esperaStatus(await context.delete(`/api/crm/deal-fields/${campoTrato.id}`), 200, "Retirar definición de trato");
  await esperaStatus(await anonimo.get("/api/crm/pipelines"), 401, "Embudo sin sesión");
  if (organizacionId) {
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 1 });
    try {
      const eventos = await db`select from_stage, to_stage from sales_deal_event
        where organization_id = ${organizacionId} and deal_id = ${trato.id} order by created_at`;
      assert.equal(eventos.length, 2);
      assert.equal(eventos[1].from_stage, inicial.id);
      assert.equal(eventos[1].to_stage, etapaExtra.id);
      const otra = `org_aislada_${suffix}`;
      await db`insert into organization (id, name, slug, created_at)
        values (${otra}, 'Organización aislada', ${`aislada-${suffix}`}, now())`;
      const [membresia] = await db`select member.id from member join "user" on "user".id = member.user_id
        where member.organization_id = ${organizacionId} and "user".email = ${correoMiembro}`;
      assert.ok(membresia);
      await db`update member set organization_id = ${otra} where id = ${membresia.id}`;
      try {
        await esperaStatus(await miembro.get(`/api/crm/pipelines/${primerEmbudo.id}/board`), 404, "Tablero de otra organización");
        await esperaStatus(await miembro.get(`/api/crm/companies/${empresaDos.id}`), 404, "Empresa de otra organización");
        await esperaStatus(await miembro.get(`/api/contacts/${contacto.id}/profile`), 404, "Perfil de otra organización");
        await esperaStatus(await miembro.patch(`/api/contacts/${contacto.id}/profile`, {
          data: { lastName: "No autorizado" },
        }), 404, "No editar perfil de otra organización");
        await esperaStatus(await miembro.post(`/api/crm/companies/${empresaDos.id}/contacts`, {
          data: { contactId: contacto.id },
        }), 404, "Vínculo de otra organización");
        await esperaStatus(await miembro.patch(`/api/crm/deals/${trato.id}`, {
          data: { titulo: "No autorizado" },
        }), 404, "Trato de otra organización");
        await esperaStatus(await miembro.post("/api/crm/activities", {
          data: { tratoId: trato.id, tipo: "nota", contenido: "No autorizado" },
        }), 404, "Actividad de otro negocio");
      } finally {
        await db`update member set organization_id = ${organizacionId} where id = ${membresia.id}`;
      }
    } finally {
      await db.end();
    }
  }
  if (organizacionId) {
    const nueva = await esperaStatus(await context.post("/api/pipeline/stages", {
      data: { name: `Temporal ${suffix}` },
    }), 201, "Crear etapa temporal");
    const etapa = (await nueva.json()).stage;
    const db = postgres(process.env.WACHATO_TEST_DB_APP, { max: 2 });
    try {
      const [lead] = await db`select id, stage_id from lead where organization_id = ${organizacionId} and contact_id = ${contacto.id}`;
      assert.ok(lead);
      if (process.env.ATRIBUCION === "on") {
        await esperaStatus(await context.put("/api/settings/whatsapp", {
          data: { wabaId: "WABA-FASE2", phoneNumberId: "PN-FASE2", token: "token-ficticio-fase2" },
        }), 200, "Conectar WhatsApp simulado");
        await esperaStatus(await context.put("/api/settings/capi", {
          data: { datasetId: "dataset-fase2" },
        }), 200, "Conectar dataset simulado");
        await db`insert into ad_attribution (id, organization_id, contact_id, conversation_id, ctwa_clid, raw)
          values (${'att_fase2_' + suffix}, ${organizacionId}, ${contacto.id},
            ${'cv_capi_' + suffix}, 'clid-ficticio-fase2', '{}')`;
        await esperaStatus(await context.patch(`/api/pipeline/stages/${etapa.id}`, {
          data: { metaEvent: "Schedule" },
        }), 422, "Rechazar evento principal no admitido por Meta");
        await esperaStatus(await context.patch(`/api/pipeline/stages/${etapa.id}`, {
          data: { metaEvent: "InitiateCheckout" },
        }), 200, "Configurar evento de etapa principal");
        const datosTablero = await (await context.get("/api/pipeline/board")).json();
        assert.ok(datosTablero.eventosMeta.includes("InitiateCheckout"));
        assert.equal(datosTablero.stages.find((s) => s.id === etapa.id).metaEvent, "InitiateCheckout");
        if (process.env.WACHATO_TEST_CHROME) {
          const browser = await chromium.launch({ executablePath: process.env.WACHATO_TEST_CHROME, headless: true });
          const navegador = await browser.newContext({ storageState: await context.storageState(), baseURL: url });
          try {
            const page = await navegador.newPage();
            await page.goto("/pipeline");
            await page.getByRole("button", { name: "Gestionar etapas" }).click();
            const selector = page.getByLabel(`Evento de Meta al entrar en ${etapa.name}`);
            await selector.waitFor();
            assert.equal(await selector.inputValue(), "InitiateCheckout");
            assert.equal(await selector.locator("option[value='Schedule']").count(), 0);
            const primerGuardado = page.waitForResponse((response) =>
              response.url().endsWith(`/api/pipeline/stages/${etapa.id}`) && response.request().method() === "PATCH" && response.ok());
            await selector.selectOption("LeadSubmitted");
            await primerGuardado;
            await page.reload();
            await page.getByRole("button", { name: "Gestionar etapas" }).click();
            assert.equal(await page.getByLabel(`Evento de Meta al entrar en ${etapa.name}`).inputValue(), "LeadSubmitted");
            const segundoGuardado = page.waitForResponse((response) =>
              response.url().endsWith(`/api/pipeline/stages/${etapa.id}`) && response.request().method() === "PATCH" && response.ok());
            await page.getByLabel(`Evento de Meta al entrar en ${etapa.name}`).selectOption("InitiateCheckout");
            await segundoGuardado;
            await page.getByRole("button", { name: "Cerrar", exact: true }).click();
            const rutaLead = `**/api/pipeline/leads/${lead.id}`;
            await page.route(rutaLead, (route) => route.abort());
            await page.getByRole("button", { name: "+ monto", exact: true }).click();
            const monto = page.getByRole("dialog", { name: "Monto y prioridad" });
            await monto.getByLabel(/Cuánto vale este trato/).fill("100");
            await monto.getByRole("button", { name: "Guardar", exact: true }).click();
            await page.getByRole("alert").filter({ hasText: "No se pudo conectar para guardar el cambio" }).waitFor();
            assert.equal(await page.getByRole("button", { name: "+ monto", exact: true }).count(), 1);
            await page.unroute(rutaLead);
          } finally {
            await navegador.close();
            await browser.close();
          }
        } else {
          await esperaStatus(await context.patch(`/api/pipeline/stages/${etapa.id}`, {
            data: { metaEvent: "InitiateCheckout" },
          }), 404, "La atribución apagada no expone eventos de etapas principales");
          const datosTablero = await (await context.get("/api/pipeline/board")).json();
          assert.equal(datosTablero.eventosMeta, null);
          await db`update pipeline_stage set meta_event = 'InitiateCheckout' where id = ${etapa.id}`;
          const listadoEtapas = await (await context.get("/api/pipeline/stages")).json();
          assert.equal("metaEvent" in listadoEtapas.stages.find((s) => s.id === etapa.id), false);
          const editada = await esperaStatus(await context.patch(`/api/pipeline/stages/${etapa.id}`, {
            data: { name: etapa.name },
          }), 200, "Editar etapa principal con atribución apagada");
          assert.equal("metaEvent" in (await editada.json()).stage, false);
        }
      }
      await esperaStatus(await context.patch(`/api/pipeline/leads/${lead.id}`, {
        data: { stageId: etapa.id },
      }), 200, "Mover lead a etapa temporal");
      if (process.env.ATRIBUCION === "on") {
        const conversiones = await db`select status from conversion_event
          where organization_id = ${organizacionId} and event_name = 'InitiateCheckout'`;
        assert.deepEqual(conversiones.map((conversion) => conversion.status), ["sent"]);
        const recibidos = await (await esperaStatus(await context.get("/api/dev/wa-mock/capi-events"),
          200, "Consultar eventos recibidos por Meta simulado")).json();
        assert.ok(recibidos.capiEvents.some((evento) =>
          evento.eventName === "InitiateCheckout" && evento.ctwaClid === "clid-ficticio-fase2"));
        await esperaStatus(await context.put("/api/settings/capi", {
          data: { datasetId: "dataset-fase2-fail" },
        }), 200, "Activar rechazo simulado");
        await esperaStatus(await context.patch(`/api/crm/pipelines/${primerEmbudo.id}/stages/${etapaExtra.id}`, {
          data: { eventoMeta: "OrderCreated" },
        }), 200, "Configurar evento de trato");
        await esperaStatus(await context.post("/api/crm/deals", {
          data: { titulo: "Trato con rechazo de Meta", contactoId: contacto.id,
            embudoId: primerEmbudo.id, etapaId: etapaExtra.id },
        }), 201, "Crear trato aunque Meta descarte el evento");
        const fallidos = await db`select status from conversion_event
          where organization_id = ${organizacionId} and event_name = 'OrderCreated'`;
        assert.deepEqual(fallidos.map((conversion) => conversion.status), ["failed"]);
      }
      const concurrente = `deal_concurrente_${suffix}`;
      let solicitud;
      await db.begin(async (tx) => {
        await tx`insert into sales_deal (id, organization_id, contact_id, legacy_stage_id, title)
          values (${concurrente}, ${organizacionId}, ${contacto.id}, ${etapa.id}, 'Prueba concurrente')`;
        solicitud = context.delete(`/api/pipeline/stages/${etapa.id}?moveTo=${lead.stage_id}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      await esperaStatus(await solicitud, 409, "El borrado espera al trato concurrente");
      const [sinMover] = await db`select stage_id from lead where organization_id = ${organizacionId} and id = ${lead.id}`;
      assert.equal(sinMover.stage_id, etapa.id);
      await db`delete from sales_deal where id = ${concurrente} and organization_id = ${organizacionId}`;
      const eliminado = await esperaStatus(
        await context.delete(`/api/pipeline/stages/${etapa.id}?moveTo=${lead.stage_id}`), 200, "Eliminar y reubicar"
      );
      assert.equal((await eliminado.json()).movedLeads, 1);
      const [reubicado] = await db`select stage_id from lead where organization_id = ${organizacionId} and id = ${lead.id}`;
      assert.equal(reubicado.stage_id, lead.stage_id);
      const eventos = await db`select id from lead_stage_event where organization_id = ${organizacionId}
        and lead_id = ${lead.id} and from_stage_name = ${etapa.name} and to_stage_id = ${lead.stage_id}`;
      assert.equal(eventos.length, 1);
    } finally {
      await db.end();
    }
  }
  if (process.env.WACHATO_TEST_DB_APP) {
    await probarExportacion({ context, anonimo, organizacionId, url, suffix });
  }
  console.log("OK: campos, archivos, validación, autenticación y permisos privado/equipo.");
} finally {
  await context.dispose();
  await anonimo.dispose();
  await miembro.dispose();
}
