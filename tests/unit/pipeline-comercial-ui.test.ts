import { describe, expect, it } from "vitest";
import { totalizarTratosPorMoneda } from "@/components/pipeline/commercial-utils";

describe("totales de tratos en el pipeline", () => {
  it("agrupa centavos por moneda y nunca mezcla conversiones", () => {
    expect(totalizarTratosPorMoneda([
      { amountCents: 150_050, currency: "MXN" },
      { amountCents: 2_500, currency: "USD" },
      { amountCents: 75_000, currency: "MXN" },
    ], "MXN")).toEqual([
      { currency: "MXN", amountCents: 225_050, deals: 2 },
      { currency: "USD", amountCents: 2_500, deals: 1 },
    ]);
  });

  it("no presenta como cero los tratos sin importe", () => {
    expect(totalizarTratosPorMoneda([
      { amountCents: null, currency: null },
    ], "MXN")).toEqual([]);
  });

  it("usa la moneda del negocio solo como fallback de importes sin moneda", () => {
    expect(totalizarTratosPorMoneda([
      { amountCents: 500, currency: null },
    ], "USD")).toEqual([
      { currency: "USD", amountCents: 500, deals: 1 },
    ]);
  });
});
