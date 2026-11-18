import { isMockEnabled } from "@/lib/env";
import {
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  validarAudioTranscripcion,
} from "@/server/transcription/provider";

export const dynamic = "force-dynamic";

type EstadoMock = {
  solicitudes: number;
  modelos: string[];
  campos: string[];
  modo: "success" | "unavailable" | "malformed" | "timeout";
};
const globalMock = globalThis as unknown as {
  __voceroTranscriptionMock?: EstadoMock;
};

function estadoMock(): EstadoMock {
  if (!globalMock.__voceroTranscriptionMock) {
    globalMock.__voceroTranscriptionMock = {
      solicitudes: 0,
      modelos: [],
      campos: [],
      modo: "success",
    };
  }
  return globalMock.__voceroTranscriptionMock;
}

export async function GET() {
  if (!isMockEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const state = estadoMock();
  return Response.json({
    solicitudes: state.solicitudes,
    modelos: state.modelos,
    campos: state.campos,
    modo: state.modo,
  });
}

export async function DELETE() {
  if (!isMockEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  estadoMock().solicitudes = 0;
  estadoMock().modelos = [];
  estadoMock().campos = [];
  estadoMock().modo = "success";
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!isMockEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as
    | { modo?: unknown }
    | null;
  if (
    body?.modo !== "success" &&
    body?.modo !== "unavailable" &&
    body?.modo !== "malformed" &&
    body?.modo !== "timeout"
  ) {
    return Response.json({ error: "invalid_mode" }, { status: 422 });
  }
  estadoMock().modo = body.modo;
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!isMockEnabled()) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "invalid_audio" }, { status: 422 });
  }
  const file = form.get("file");
  const model = form?.get("model");
  if (
    !(file instanceof File) ||
    file.size > MAX_TRANSCRIPTION_AUDIO_BYTES ||
    typeof model !== "string"
  ) {
    return Response.json({ error: "invalid_audio" }, { status: 422 });
  }
  const audio = Buffer.from(await file.arrayBuffer());
  if (!validarAudioTranscripcion(audio, file.type)) {
    return Response.json({ error: "invalid_audio" }, { status: 422 });
  }
  const state = estadoMock();
  state.solicitudes += 1;
  state.modelos.push(model);
  state.campos = [...form.keys()].sort();
  if (state.modo === "unavailable") {
    return Response.json({ error: "simulated" }, { status: 503 });
  }
  if (state.modo === "malformed") {
    return Response.json({ text: { content: "not a string" } });
  }
  if (state.modo === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return Response.json({ text: "Transcripción sintética de prueba." });
}
