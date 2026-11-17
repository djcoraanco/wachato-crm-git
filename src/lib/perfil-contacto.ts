import { z } from "zod";

const texto = z.string().trim().min(1).max(200);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((valor) => {
  const parsed = new Date(`${valor}T00:00:00.000Z`);
  return valor.slice(0, 4) !== "0000" && !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === valor;
}, "Fecha inválida");

export const perfilContactoSchema = z.object({
  firstName: texto.nullable().optional(),
  lastName: texto.nullable().optional(),
  identification: texto.nullable().optional(),
  phones: z.array(z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/).refine((valor) => {
    const digitos = valor.replace(/\D/g, "").length;
    return digitos >= 7 && digitos <= 15;
  }, "Teléfono inválido")).max(20).optional(),
  emails: z.array(z.string().trim().email().max(254)).max(20).optional(),
  birthDate: fecha.nullable().optional(),
  address: z.object({
    street: texto.optional(), city: texto.optional(), region: texto.optional(),
    postalCode: texto.optional(), country: texto.optional(),
  }).strict().nullable().optional(),
  preferredChannel: z.enum(["whatsapp", "instagram", "messenger", "tiktok", "phone", "email"]).nullable().optional(),
  consents: z.record(z.string().trim().min(1).max(80), z.object({
    granted: z.boolean(),
    recordedAt: z.string().datetime({ offset: true }),
  }).strict()).refine((datos) => Object.keys(datos).length <= 30, "Demasiados consentimientos").optional(),
}).strict().refine((datos) => Object.keys(datos).length > 0, "No hay cambios");

export type PerfilContactoInput = z.infer<typeof perfilContactoSchema>;
