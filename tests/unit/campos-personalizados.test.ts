import { describe, expect, it } from "vitest";
import { definicionCampoSchema, esquemaValorCampo, type DefinicionCampo } from "@/lib/campos-personalizados";

const campo = { entidad: "contacto", clave: "dato", nombre: "Dato", tipo: "texto", opciones: [] } as const;

describe("definiciones de campos personalizados", () => {
  it("rechaza opciones vacías o duplicadas en una selección", () => {
    expect(definicionCampoSchema.safeParse({ ...campo, tipo: "select" }).success).toBe(false);
    expect(definicionCampoSchema.safeParse({ ...campo, tipo: "select", opciones: ["uno", "uno"] }).success).toBe(false);
    expect(definicionCampoSchema.safeParse({ ...campo, opciones: ["uno"] }).success).toBe(false);
    expect(definicionCampoSchema.safeParse({ ...campo, tipo: "select", opciones: ["uno"] }).success).toBe(true);
  });
});

describe("valores personalizados", () => {
  function acepta(tipo: DefinicionCampo["tipo"], valor: unknown, opciones: string[] = []) {
    return esquemaValorCampo({ tipo, opciones }).safeParse(valor).success;
  }

  it("valida valores sin convertirlos silenciosamente", () => {
    expect(acepta("numero", "12")).toBe(false);
    expect(acepta("numero", 12)).toBe(true);
    expect(acepta("booleano", "true")).toBe(false);
    expect(acepta("booleano", false)).toBe(true);
    expect(acepta("texto", "x".repeat(4001))).toBe(false);
  });

  it("valida moneda y fechas reales", () => {
    expect(acepta("moneda", { centavos: 123, moneda: "DOP" })).toBe(true);
    expect(acepta("moneda", { centavos: 1.5, moneda: "DOP" })).toBe(false);
    expect(acepta("moneda", { centavos: 100, moneda: "XXX" })).toBe(false);
    expect(acepta("fecha", "2024-02-29")).toBe(true);
    expect(acepta("fecha", "2025-02-29")).toBe(false);
  });

  it("rechaza opciones ajenas o duplicadas y archivos mal formados", () => {
    expect(acepta("select", "a", ["a"])).toBe(true);
    expect(acepta("select", "b", ["a"])).toBe(false);
    expect(acepta("multiselect", ["a", "a"], ["a"])).toBe(false);
    expect(acepta("archivo", { id: "../secreto" })).toBe(false);
    expect(acepta("archivo", { id: `cf_${"a".repeat(20)}` })).toBe(true);
  });

  it("limita JSON por bytes y admite estructuras válidas", () => {
    expect(acepta("json", { claves: [1, null, true] })).toBe(true);
    expect(acepta("json", "á".repeat(8192))).toBe(false);
    let profundo: unknown = true;
    for (let i = 0; i < 40; i++) profundo = [profundo];
    expect(acepta("json", profundo)).toBe(false);
    const ciclico: { propio?: unknown } = {};
    ciclico.propio = ciclico;
    expect(acepta("json", ciclico)).toBe(false);
  });
});
