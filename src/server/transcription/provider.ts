import { getEnv, isMockEnabled } from "@/lib/env";
import type { VoiceTranscriptionProvider } from "@/server/transcription/credentials";
import { z } from "zod";

export const MAX_TRANSCRIPTION_AUDIO_BYTES = 16 * 1024 * 1024;
export const TRANSCRIPTION_TIMEOUT_MS = 4_000;
export const MAX_TRANSCRIPTION_CHARS = 10_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const respuestaSchema = z.object({ text: z.string().max(100_000) });

async function leerJsonLimitado(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    await reader.cancel().catch(() => {});
    return null;
  }
}

const MIME_EXTENSION: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
};

export function validarAudioTranscripcion(
  audio: Buffer,
  mimeType: string | null
): { mimeType: string; fileName: string } | null {
  if (!mimeType || audio.length < 12 || audio.length > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return null;
  }
  const mime = mimeType.split(";")[0]!.trim().toLowerCase();
  const extension = MIME_EXTENSION[mime];
  if (!extension) return null;

  const firmaValida =
    (mime === "audio/ogg" && audio.subarray(0, 4).toString("ascii") === "OggS") ||
    (mime === "audio/mpeg" &&
      (audio.subarray(0, 3).toString("ascii") === "ID3" ||
        (audio[0] === 0xff && (audio[1]! & 0xe0) === 0xe0))) ||
    (mime === "audio/mp4" && audio.subarray(4, 8).toString("ascii") === "ftyp") ||
    (mime === "audio/aac" && audio[0] === 0xff && (audio[1]! & 0xf6) === 0xf0) ||
    (mime === "audio/amr" && audio.subarray(0, 6).toString("ascii") === "#!AMR\n") ||
    (mime === "audio/wav" &&
      audio.subarray(0, 4).toString("ascii") === "RIFF" &&
      audio.subarray(8, 12).toString("ascii") === "WAVE");
  if (!firmaValida) return null;
  return { mimeType: mime, fileName: `nota-de-voz.${extension}` };
}

export function endpointTranscripcion(provider: VoiceTranscriptionProvider): string {
  if (isMockEnabled()) {
    return new URL(
      "/api/dev/transcription-mock",
      getEnv().APP_BASE_URL
    ).toString();
  }
  return provider === "groq"
    ? "https://api.groq.com/openai/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/transcriptions";
}

export async function transcribirAudio(
  input: {
    provider: VoiceTranscriptionProvider;
    token: string;
    audio: Buffer;
    mimeType: string;
    fileName: string;
  },
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const form = new FormData();
  const bytes = new Uint8Array(input.audio);
  form.set(
    "file",
    new Blob([bytes], { type: input.mimeType }),
    input.fileName
  );
  form.set("model", input.provider === "groq" ? "whisper-large-v3" : "whisper-1");

  try {
    const response = await (options.fetchImpl ?? fetch)(
      endpointTranscripcion(input.provider),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${input.token}` },
        body: form,
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return null;
    }
    const data = await leerJsonLimitado(response);
    const parsed = respuestaSchema.safeParse(data);
    if (!parsed.success) return null;
    const normalized = parsed.data.text.trim().slice(0, MAX_TRANSCRIPTION_CHARS);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
