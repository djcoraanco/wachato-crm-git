import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deleteVoiceTranscriptionConfig,
  getVoiceTranscriptionConfig,
  saveVoiceTranscriptionConfig,
  VoiceTranscriptionConfigError,
} from "@/server/transcription/credentials";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["openai", "groq"]).default("openai"),
  token: z.string().min(1).max(4096).optional(),
});

export const GET = withAuth(async (session) => {
  return Response.json({
    config: await getVoiceTranscriptionConfig(session.organizationId),
  });
});

export const PUT = withAuth(async (session, req: Request) => {
  const parsed = await parseBody(req, settingsSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const config = await saveVoiceTranscriptionConfig({
      organizationId: session.organizationId,
      provider: parsed.data.provider ?? "openai",
      enabled: parsed.data.enabled,
      token: parsed.data.token,
    });
    return Response.json({ config });
  } catch (error) {
    if (error instanceof VoiceTranscriptionConfigError) {
      return apiError(422, error.code, error.message);
    }
    throw error;
  }
});

export const DELETE = withAuth(async (session) => {
  await deleteVoiceTranscriptionConfig(session.organizationId);
  return Response.json({ config: null });
});
