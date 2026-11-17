import { readFile } from "node:fs/promises";

const archivo = ".next/server/app/api/contacts/export/route.js.nft.json";
const trazado = JSON.parse(await readFile(archivo, "utf8"));
if (!Array.isArray(trazado.files)) throw new Error("El trazado de exportación no contiene archivos");
const archivos = trazado.files.map((nombre) => nombre.replaceAll("\\", "/"));
const usaGenerador = archivos.some((nombre) =>
  /\/is-generator-function@[^/]+\/node_modules\/generator-function$/.test(nombre)
);
if (usaGenerador) {
  for (const nombre of ["package.json", "index.js", "require.mjs"]) {
    if (!archivos.some((archivo) =>
      new RegExp(`/generator-function@[^/]+/node_modules/generator-function/${nombre.replace(".", "\\.")}$`).test(archivo)
    )) {
      throw new Error(`El trazado de exportación omite generator-function/${nombre}`);
    }
  }
}
console.log("Trazado de exportación verificado.");
