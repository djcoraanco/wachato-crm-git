import { z } from "zod";

const texto = z.string().trim().min(1).max(200);
const direccion = z.object({
  street: texto.optional(),
  city: texto.optional(),
  region: texto.optional(),
  postalCode: texto.optional(),
  country: texto.optional(),
}).strict();

export const empresaSchema = z.object({
  name: texto,
  taxId: texto.nullable().optional(),
  phone: texto.nullable().optional(),
  address: direccion.nullable().optional(),
  parentCompanyId: z.string().min(1).max(100).nullable().optional(),
}).strict();

export const editarEmpresaSchema = empresaSchema.partial()
  .refine((valor) => Object.keys(valor).length > 0, "No hay cambios");
export const vinculoEmpresaSchema = z.object({
  contactId: z.string().min(1).max(100),
}).strict();
export type EmpresaInput = z.infer<typeof empresaSchema>;
export type EditarEmpresa = z.infer<typeof editarEmpresaSchema>;
