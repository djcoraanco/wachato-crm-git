import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  TRANSCRIPTION_TIMEOUT_MS,
  transcribirAudio,
  validarAudioTranscripcion,
} from "@/server/transcription/provider";

const oggSintetico = () => Buffer.from(`OggS${"x".repeat(16)}`);

afterEach(() => {
  delete process.env.WA_MOCK_ENABLED;
});

describe("validación del audio de transcripción", () => {
  it("acepta Ogg sintético válido y normaliza parámetros MIME", () => {
    expect(
      validarAudioTranscripcion(oggSintetico(), "audio/ogg; codecs=opus")
    ).toEqual({ mimeType: "audio/ogg", fileName: "nota-de-voz.ogg" });
  });

  it("rechaza firma, MIME y tamaño inválidos antes de contactar al proveedor", () => {
    expect(
      validarAudioTranscripcion(Buffer.from("no es audio válido"), "audio/ogg")
    ).toBeNull();
    expect(validarAudioTranscripcion(oggSintetico(), "image/png")).toBeNull();
    expect(
      validarAudioTranscripcion(
        Buffer.concat([
          Buffer.from("OggS"),
          Buffer.alloc(MAX_TRANSCRIPTION_AUDIO_BYTES),
        ]),
        "audio/ogg"
      )
    ).toBeNull();
  });
});

describe("adaptador OpenAI-compatible de transcripción", () => {
  it("manda solo modelo y archivo, y tolera una respuesta correcta", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        "Bearer token-sintetico"
      );
      expect([...form.keys()].sort()).toEqual(["file", "model"]);
      expect(form.get("model")).toBe("whisper-1");
      const file = form.get("file") as File;
      expect(file.name).toBe("nota.ogg");
      expect(file.type).toBe("audio/ogg");
      return Response.json({ text: "  texto de prueba  " });
    }) as unknown as typeof fetch;

    await expect(
      transcribirAudio(
        {
          provider: "openai",
          token: "token-sintetico",
          audio: oggSintetico(),
          mimeType: "audio/ogg",
          fileName: "nota.ogg",
        },
        { fetchImpl }
      )
    ).resolves.toBe("texto de prueba");
  });

  it("no devuelve cuerpo/errores del proveedor, respuesta malformada ni texto vacío", async () => {
    const response = (res: Response) =>
      vi.fn(async () => res) as unknown as typeof fetch;
    const input = {
      provider: "groq" as const,
      token: "token-sintetico",
      audio: oggSintetico(),
      mimeType: "audio/ogg",
      fileName: "nota.ogg",
    };

    await expect(transcribirAudio(input, { fetchImpl: response(new Response("secret", { status: 401 })) })).resolves.toBeNull();
    await expect(transcribirAudio(input, { fetchImpl: response(Response.json({ text: "  " })) })).resolves.toBeNull();
    await expect(transcribirAudio(input, { fetchImpl: response(Response.json({ text: 4 })) })).resolves.toBeNull();
  });

  it("aborta un proveedor lento dentro del timeout configurado", async () => {
    let abortada = false;
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          abortada = true;
          reject(new Error("aborted"));
        });
      })) as typeof fetch;
    const salida = await transcribirAudio(
      {
        provider: "openai",
        token: "token-sintetico",
        audio: oggSintetico(),
        mimeType: "audio/ogg",
        fileName: "nota.ogg",
      },
      { fetchImpl, timeoutMs: 20 }
    );
    expect(salida).toBeNull();
    expect(abortada).toBe(true);
    expect(TRANSCRIPTION_TIMEOUT_MS).toBe(4_000);
  });
});
