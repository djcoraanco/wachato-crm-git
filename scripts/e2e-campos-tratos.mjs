import assert from "node:assert/strict";

async function status(response, esperado, nombre) {
  assert.equal(response.status(), esperado, `${nombre}: HTTP ${response.status()} ${await response.text()}`);
  return response;
}

export async function probarCamposTratos({ page, browser, context, miembro, url, embudo, trato, otroTrato, titulo }) {
  await page.getByLabel("Seleccionar embudo").selectOption(embudo.id);
  await page.getByRole("button", { name: "Campos personalizados", exact: true }).click();
  const gestor = page.getByRole("dialog", { name: "Campos de trato" });
  async function crear(nombre, tipo, visibilidad) {
    await gestor.getByLabel("Nombre visible").fill(nombre);
    await gestor.locator("label").filter({ hasText: /^Tipo/ }).locator("select").selectOption(tipo);
    await gestor.locator("label").filter({ hasText: /^Visibilidad/ }).locator("select").selectOption(visibilidad);
    await gestor.getByRole("button", { name: "Guardar campo" }).click();
    await gestor.getByRole("button", { name: new RegExp(`^${nombre} `) }).waitFor();
  }
  await crear("Dato privado", "texto", "privado");
  await crear("Dato equipo", "texto", "equipo");
  await crear("Documento trato", "archivo", "privado");
  await gestor.getByLabel("Nombre visible").fill("Dato privado");
  await gestor.getByRole("button", { name: "Guardar campo" }).click();
  await gestor.getByRole("alert").getByText("Ya existe un campo con esa clave").waitFor();
  await gestor.getByRole("button", { name: "Cerrar" }).click();
  const campos = (await (await status(await context.get("/api/crm/deal-fields"), 200, "Listar campos")).json()).campos;
  const privado = campos.find((c) => c.nombre === "Dato privado");
  const equipo = campos.find((c) => c.nombre === "Dato equipo");
  const archivo = campos.find((c) => c.nombre === "Documento trato");
  assert.ok(privado && equipo && archivo);
  await status(await context.get(`/api/crm/deal-fields/${equipo.id}/values`), 422, "Exigir trato");
  await status(await context.get(`/api/crm/deal-fields/${equipo.id}/values?entidadId=`), 422, "Trato vacío");
  await status(await context.get(`/api/crm/deal-fields/${equipo.id}/values?entidadId=no-existe`), 404, "Trato inexistente");
  await status(await context.put(`/api/crm/deal-fields/${equipo.id}/values`, {
    data: { entidadId: trato.id, valor: 123 },
  }), 422, "Valor inválido");
  await status(await context.put(`/api/crm/deal-fields/${equipo.id}/values`, {
    data: { entidadId: otroTrato.id, valor: "Valor del otro trato" },
  }), 200, "Valor del otro trato");

  await page.getByLabel(`Abrir el trato ${titulo}`).click();
  const cajon = page.getByRole("dialog", { name: `Trato: ${titulo}` });
  const editor = cajon.getByRole("region", { name: "Campos personalizados" });
  const privadoUI = editor.locator("div.rounded-md.border").filter({ has: page.getByLabel("Dato privado") });
  const equipoUI = editor.locator("div.rounded-md.border").filter({ has: page.getByLabel("Dato equipo") });
  const archivoUI = editor.locator("div.rounded-md.border").filter({ has: page.getByLabel("Cargar Documento trato") });
  await editor.getByLabel("Dato equipo").waitFor();
  assert.equal(await editor.getByLabel("Dato equipo").inputValue(), "");
  await editor.getByLabel("Dato privado").fill("Solo administración");
  await privadoUI.getByRole("button", { name: "Guardar", exact: true }).click();
  await privadoUI.getByRole("status").getByText("Guardado").waitFor();
  await editor.getByLabel("Dato equipo").fill("Primer trato");
  await page.route(`**/api/crm/deal-fields/${equipo.id}/values`, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue());
  await equipoUI.getByRole("button", { name: "Guardar", exact: true }).click();
  await equipoUI.getByRole("alert").getByText("No se pudo conectar con el servidor").waitFor();
  assert.equal(await editor.getByLabel("Dato equipo").inputValue(), "Primer trato");
  await page.unroute(`**/api/crm/deal-fields/${equipo.id}/values`);
  await equipoUI.getByRole("button", { name: "Guardar", exact: true }).click();
  await equipoUI.getByRole("status").getByText("Guardado").waitFor();
  const valorActual = (await (await status(await context.get(
    `/api/crm/deal-fields/${equipo.id}/values?entidadId=${trato.id}`), 200, "Valor del trato")).json()).valores;
  assert.deepEqual(valorActual, [{ entidadId: trato.id, valor: "Primer trato" }]);
  const valorOtro = (await (await context.get(
    `/api/crm/deal-fields/${equipo.id}/values?entidadId=${otroTrato.id}`)).json()).valores;
  assert.deepEqual(valorOtro, [{ entidadId: otroTrato.id, valor: "Valor del otro trato" }]);

  await page.route(`**/api/crm/deal-fields/${archivo.id}/values`, (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue());
  await editor.getByLabel("Cargar Documento trato").setInputFiles({
    name: "fallido.txt", mimeType: "text/plain", buffer: Buffer.from("fallido"),
  });
  await archivoUI.getByRole("alert").getByText("No se pudo conectar con el servidor").waitFor();
  assert.deepEqual((await (await context.get(`/api/crm/deal-fields/files?campoId=${archivo.id}`)).json()).archivos, []);
  await page.unroute(`**/api/crm/deal-fields/${archivo.id}/values`);
  await editor.getByLabel("Cargar Documento trato").setInputFiles({
    name: "contrato.txt", mimeType: "text/plain", buffer: Buffer.from("contrato original"),
  });
  await archivoUI.getByRole("status").getByText("Archivo cargado y vinculado de forma privada.").waitFor();
  const valorArchivo = (await (await context.get(
    `/api/crm/deal-fields/${archivo.id}/values?entidadId=${trato.id}`)).json()).valores[0].valor;
  const descarga = await status(await context.get(`/api/crm/deal-fields/files/${valorArchivo.id}`), 200, "Descargar archivo");
  assert.equal((await descarga.body()).toString(), "contrato original");
  await status(await miembro.get(`/api/crm/deal-fields/files/${valorArchivo.id}`), 404, "Archivo privado");
  await editor.getByLabel("Cargar Documento trato").setInputFiles({
    name: "nuevo.txt", mimeType: "text/plain", buffer: Buffer.from("contrato nuevo"),
  });
  await archivoUI.getByRole("status").getByText("Archivo reemplazado y vinculado de forma privada.").waitFor();
  await status(await context.get(`/api/crm/deal-fields/files/${valorArchivo.id}`), 404, "Archivo anterior eliminado");
  const nuevoArchivo = (await (await context.get(
    `/api/crm/deal-fields/${archivo.id}/values?entidadId=${trato.id}`)).json()).valores[0].valor.id;
  await cajon.getByRole("button", { name: "Cerrar panel del trato" }).click();
  await page.reload();
  await page.getByLabel("Seleccionar embudo").selectOption(embudo.id);
  await page.getByLabel(`Abrir el trato ${titulo}`).click();
  await editor.getByLabel("Dato equipo").waitFor();
  assert.equal(await editor.getByLabel("Dato equipo").inputValue(), "Primer trato");
  assert.equal(await editor.getByLabel("Dato privado").inputValue(), "Solo administración");
  await editor.getByRole("link", { name: "Archivo adjunto" }).waitFor();

  const definicionesMiembro = (await (await status(await miembro.get("/api/crm/deal-fields"), 200, "Campos visibles")).json()).campos;
  assert.deepEqual(definicionesMiembro.map((c) => c.id), [equipo.id]);
  await status(await miembro.post("/api/crm/deal-fields", { data: {} }), 403, "Miembro no administra");
  await status(await miembro.patch(`/api/crm/deal-fields/${equipo.id}`, { data: { nombre: "No" } }), 403, "Miembro no edita definición");
  await status(await miembro.delete(`/api/crm/deal-fields/${equipo.id}`), 403, "Miembro no elimina definición");
  await status(await miembro.get(`/api/crm/deal-fields/${privado.id}/values?entidadId=${trato.id}`), 404, "Valor privado");
  await status(await miembro.put(`/api/crm/deal-fields/${privado.id}/values`, {
    data: { entidadId: trato.id, valor: "No" },
  }), 404, "No escribir privado");
  const contextoMiembro = await browser.newContext({ baseURL: url, storageState: await miembro.storageState() });
  try {
    const paginaMiembro = await contextoMiembro.newPage();
    await paginaMiembro.goto("/pipeline");
    await paginaMiembro.getByLabel("Seleccionar embudo").selectOption(embudo.id);
    assert.equal(await paginaMiembro.getByRole("button", { name: "Campos personalizados", exact: true }).count(), 0);
    await paginaMiembro.getByLabel(`Abrir el trato ${titulo}`).click();
    const editorMiembro = paginaMiembro.getByRole("region", { name: "Campos personalizados" });
    await editorMiembro.getByLabel("Dato equipo").waitFor();
    assert.equal(await editorMiembro.getByLabel("Dato privado").count(), 0);
    assert.equal(await editorMiembro.getByLabel("Cargar Documento trato").count(), 0);
    await editorMiembro.getByLabel("Dato equipo").fill("Actualizado por miembro");
    await editorMiembro.getByRole("button", { name: "Guardar", exact: true }).click();
    await editorMiembro.getByRole("status").getByText("Guardado").waitFor();
  } finally {
    await contextoMiembro.close();
  }
  await archivoUI.getByRole("button", { name: "Quitar valor" }).click();
  await archivoUI.getByRole("status").getByText("Valor y archivo eliminados.").waitFor();
  await status(await context.get(`/api/crm/deal-fields/files/${nuevoArchivo}`), 404, "Archivo eliminado");
  await cajon.getByRole("button", { name: "Cerrar panel del trato" }).click();
  return { privado, equipo, archivo };
}
