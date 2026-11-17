import { z } from "zod";
import { CURRENCIES } from "@/lib/money";
import { META_BUSINESS_MESSAGING_EVENTS } from "@/lib/meta/capi";

const nombre = z.string().trim().min(1).max(100);
const id = z.string().min(1).max(100);
const monto = z.object({
  centavos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  moneda: z.enum(CURRENCIES),
}).strict();

export const embudoSchema = z.object({ nombre }).strict();
export const etapaComercialSchema = z.object({ nombre }).strict();
export const editarEtapaComercialSchema = z.object({
  nombre: nombre.optional(),
  posicion: z.number().int().min(0).max(1_000_000).optional(),
  eventoMeta: z.enum(META_BUSINESS_MESSAGING_EVENTS).nullable().optional(),
}).strict().refine((valor) => Object.keys(valor).length > 0, "No hay cambios");
export const tratoSchema = z.object({
  titulo: nombre,
  contactoId: id,
  embudoId: id,
  etapaId: id,
  monto: monto.nullable().optional(),
}).strict();
export const editarTratoSchema = z.object({
  titulo: nombre.optional(),
  etapaId: id.optional(),
  monto: monto.nullable().optional(),
}).strict().refine((valor) => Object.keys(valor).length > 0, "No hay cambios");
export const actividadSchema = z.object({
  contactoId: id.optional(),
  leadId: id.optional(),
  tratoId: id.optional(),
  tipo: z.enum(["llamada", "reunion", "tarea", "nota"]),
  contenido: z.string().trim().min(1).max(4000),
  vence: z.string().datetime({ offset: true }).nullable().optional(),
}).strict().refine((valor) => valor.contactoId || valor.leadId || valor.tratoId, "Selecciona un contacto o trato");

export type TratoInput = z.infer<typeof tratoSchema>;
export type EditarTrato = z.infer<typeof editarTratoSchema>;
export type ActividadInput = z.infer<typeof actividadSchema>;
export type EditarEtapaComercial = z.infer<typeof editarEtapaComercialSchema>;
