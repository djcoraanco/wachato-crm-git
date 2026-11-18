import { describe, expect, it } from "vitest";
import { conversacionPuedeTranscribir } from "@/server/transcription/politica";

describe("elegibilidad de transcripción", () => {
  it("permite solo WhatsApp real y excluye el Laboratorio", () => {
    expect(conversacionPuedeTranscribir("whatsapp", false)).toBe(true);
    expect(conversacionPuedeTranscribir("whatsapp", true)).toBe(false);
  });

  it.each(["instagram", "messenger", "tiktok"] as const)(
    "no transcribe el canal %s",
    (channel) => {
      expect(conversacionPuedeTranscribir(channel, false)).toBe(false);
    }
  );
});
