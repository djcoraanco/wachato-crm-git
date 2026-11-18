import { afterEach, describe, expect, it, vi } from "vitest";
import type { MensajeParaEvento } from "@/server/brains/contract";
import { agregarTranscripcionesDeVoz } from "@/server/brains/deliver";

const config = {
  organizationId: "org_private",
  provider: "openai" as const,
  enabled: true,
  token: "secret-provider-token",
  tokenLast4: "oken",
  updatedAt: new Date(),
};

function mensajes(): MensajeParaEvento[] {
  return [
    {
      id: "private-message-id",
      createdAt: new Date(),
      type: "audio",
      text: null,
      media: {
        waMediaId: "private-media-id",
        mimeType: "audio/ogg",
        caption: "private-caption",
        assetId: "private-asset-id",
        fileSize: 64,
        fetchStatus: "available",
      },
    },
    {
      id: "text-message",
      createdAt: new Date(),
      type: "text",
      text: "private-message-text",
      media: null,
    },
  ];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fallos tolerados de transcripción en el despacho", () => {
  it("si no puede leer la configuración, marca audios unavailable y registra sin datos privados", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cargarConfig = vi
      .fn()
      .mockRejectedValue(
        new Error("private-provider-token private-caption private-message-text")
      );
    const transcribir = vi.fn();
    const entrada = mensajes();

    const resultado = await agregarTranscripcionesDeVoz(
      entrada,
      "private-organization-id",
      { cargarConfig, transcribir }
    );

    expect(resultado[0]?.transcription).toEqual({ status: "unavailable" });
    expect(resultado[1]).toEqual(entrada[1]);
    expect(transcribir).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    const registro = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(registro)).toEqual({
      evento: "transcripcion_no_disponible",
      etapa: "configuracion",
      resultado: "despacho_continua",
    });
    for (const privado of [
      "private-provider-token",
      "private-caption",
      "private-message-text",
      "private-message-id",
      "private-media-id",
      "private-asset-id",
      "private-organization-id",
    ]) {
      expect(registro).not.toContain(privado);
    }
  });

  it("si falla una transcripción inesperadamente, registra solo una etapa segura", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const transcribir = vi
      .fn()
      .mockRejectedValue(
        new Error("private-provider-token private-caption private-message-text")
      );

    const resultado = await agregarTranscripcionesDeVoz(
      mensajes(),
      "private-organization-id",
      { cargarConfig: vi.fn().mockResolvedValue(config), transcribir }
    );

    expect(resultado[0]?.transcription).toEqual({ status: "unavailable" });
    expect(log).toHaveBeenCalledTimes(1);
    const registro = String(log.mock.calls[0]?.[0]);
    expect(JSON.parse(registro)).toEqual({
      evento: "transcripcion_no_disponible",
      etapa: "medio",
      resultado: "despacho_continua",
    });
    expect(registro).not.toContain("private-");
  });
});
