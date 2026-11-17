import { z } from "zod";
import { CURRENCIES } from "@/lib/money";

export const TIPOS_CAMPO = [
  "texto",
  "numero",
  "moneda",
  "fecha",
  "booleano",
  "select",
  "multiselect",
  "archivo",
  "json",
] as const;

const opcion = z.string().trim().min(1).max(100);
export const nombreArchivoCampoSchema = z.string().trim().min(1).max(200).regex(/^[^/\\\x00-\x1f\x7f]+$/);
export const idCampoSchema = z.string().regex(/^campo_[a-z0-9]{20}$/);

export const definicionCampoSchema = z.object({
  entidad: z.enum(["contacto", "empresa"]),
  clave: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/, "Usa letras minúsculas, números y guion bajo"),
  nombre: z.string().trim().min(1).max(100),
  tipo: z.enum(TIPOS_CAMPO),
  opciones: z.array(opcion).max(100).default([]),
  visibilidad: z.enum(["privado", "equipo"]).default("privado"),
}).strict().superRefine((campo, ctx) => {
  const seleccion = campo.tipo === "select" || campo.tipo === "multiselect";
  if (seleccion && campo.opciones.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones"], message: "Agrega al menos una opción" });
  }
  if (!seleccion && campo.opciones.length !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones"], message: "Este tipo no admite opciones" });
  }
  if (new Set(campo.opciones).size !== campo.opciones.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["opciones"], message: "Las opciones no pueden repetirse" });
  }
});

export type DefinicionCampo = z.infer<typeof definicionCampoSchema>;

export const definicionCampoTratoSchema = z.object({
  entidad: z.literal("trato"),
}).passthrough().transform((valor) => ({ ...valor, entidad: "empresa" })).pipe(definicionCampoSchema);

export const edicionCampoSchema = z.object({
  nombre: z.string().trim().min(1).max(100).optional(),
  opciones: z.array(opcion).max(100).optional(),
  visibilidad: z.enum(["privado", "equipo"]).optional(),
}).strict().refine((valor) => Object.keys(valor).length > 0, "No hay cambios");

export type EdicionCampo = z.infer<typeof edicionCampoSchema>;

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.valueOf()) && fecha.toISOString().slice(0, 10) === valor;
}, "Fecha inválida");

const json = z.unknown().superRefine((valor, ctx) => {
  const pendientes: { valor: unknown; profundidad: number }[] = [{ valor, profundidad: 0 }];
  const vistos = new WeakSet<object>();
  let nodos = 0;
  while (pendientes.length > 0) {
    const actual = pendientes.pop()!;
    if (++nodos > 5000 || actual.profundidad > 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON demasiado complejo" });
      return;
    }
    const item = actual.valor;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number" && Number.isFinite(item)) continue;
    if (
      typeof item !== "object" ||
      vistos.has(item) ||
      (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON inválido" });
      return;
    }
    vistos.add(item);
    for (const hijo of Object.values(item)) {
      pendientes.push({ valor: hijo, profundidad: actual.profundidad + 1 });
    }
  }
  if (new TextEncoder().encode(JSON.stringify(valor)).length > 16 * 1024) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON excede 16 KB" });
  }
});

/** Valida el contenido, no la autorización del archivo ni la entidad. */
export function esquemaValorCampo(campo: Pick<DefinicionCampo, "tipo" | "opciones">): z.ZodType<unknown> {
  switch (campo.tipo) {
    case "texto":
      return z.string().max(4000);
    case "numero":
      return z.number().finite();
    case "moneda":
      return z.object({
        centavos: z.number().int().safe(),
        moneda: z.enum(CURRENCIES),
      }).strict();
    case "fecha":
      return fecha;
    case "booleano":
      return z.boolean();
    case "select":
      return z.string().refine((valor) => campo.opciones.includes(valor), "Opción no permitida");
    case "multiselect":
      return z.array(z.string()).max(100).refine(
        (valores) => new Set(valores).size === valores.length && valores.every((valor) => campo.opciones.includes(valor)),
        "Opciones duplicadas o no permitidas"
      );
    case "archivo":
      return z.object({ id: z.string().regex(/^cf_[a-z0-9]{20}$/) }).strict();
    case "json":
      return json;
  }
}
