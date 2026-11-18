import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { last4 } from "@/lib/ai/presets";

export type VoiceTranscriptionProvider = "openai" | "groq";
type Row = typeof schema.voiceTranscriptionCredentials.$inferSelect;

export type VoiceTranscriptionConfigPublic = {
  provider: VoiceTranscriptionProvider;
  enabled: boolean;
  tokenLast4: string;
  updatedAt: Date;
};

export type VoiceTranscriptionConfigSecret = VoiceTranscriptionConfigPublic & {
  token: string;
  organizationId: string;
};

function toPublic(row: Row): VoiceTranscriptionConfigPublic {
  return {
    provider: row.provider,
    enabled: row.enabled,
    tokenLast4: row.tokenLast4,
    updatedAt: row.updatedAt,
  };
}

async function filaDe(organizationId: string): Promise<Row | null> {
  const rows = await getDb()
    .select()
    .from(schema.voiceTranscriptionCredentials)
    .where(
      scoped(
        schema.voiceTranscriptionCredentials.organizationId,
        organizationId
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getVoiceTranscriptionConfig(
  organizationId: string
): Promise<VoiceTranscriptionConfigPublic | null> {
  const row = await filaDe(organizationId);
  return row ? toPublic(row) : null;
}

export async function getVoiceTranscriptionSecret(
  organizationId: string
): Promise<VoiceTranscriptionConfigSecret | null> {
  const row = await filaDe(organizationId);
  if (!row) return null;
  return {
    ...toPublic(row),
    organizationId,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

export class VoiceTranscriptionConfigError extends Error {
  constructor(readonly code: "sin_token" | "token_requerido") {
    super(
      code === "sin_token"
        ? "No hay una credencial guardada para conservar"
        : "Guarda una llave del proveedor antes de activar la transcripción"
    );
    this.name = "VoiceTranscriptionConfigError";
  }
}

export async function saveVoiceTranscriptionConfig(input: {
  organizationId: string;
  provider: VoiceTranscriptionProvider;
  enabled: boolean;
  token?: string;
}): Promise<VoiceTranscriptionConfigPublic | null> {
  const db = getDb();
  const existing = await filaDe(input.organizationId);

  if (input.token === undefined) {
    if (!existing) {
      if (!input.enabled) return null;
      throw new VoiceTranscriptionConfigError("token_requerido");
    }
    if (existing.provider !== input.provider) {
      throw new VoiceTranscriptionConfigError("token_requerido");
    }
    const updated = await db
      .update(schema.voiceTranscriptionCredentials)
      .set({ enabled: input.enabled, updatedAt: new Date() })
      .where(
        scoped(
          schema.voiceTranscriptionCredentials.organizationId,
          input.organizationId
        )
      )
      .returning();
    const row = updated[0];
    if (!row) throw new VoiceTranscriptionConfigError("sin_token");
    await borrarCache(input.organizationId);
    return toPublic(row);
  }

  const encrypted = encryptSecret(input.token);
  const values = {
    provider: input.provider,
    enabled: input.enabled,
    tokenCipher: encrypted.cipher,
    tokenIv: encrypted.iv,
    tokenTag: encrypted.tag,
    tokenLast4: last4(input.token),
    updatedAt: new Date(),
  };
  const rows = await db
    .insert(schema.voiceTranscriptionCredentials)
    .values({
      id: newId("voiceTranscriptionCredentials"),
      organizationId: input.organizationId,
      ...values,
    })
    .onConflictDoUpdate({
      target: [schema.voiceTranscriptionCredentials.organizationId],
      set: values,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("no se pudo guardar la configuración de transcripción");
  await borrarCache(input.organizationId);
  return toPublic(row);
}

export async function deleteVoiceTranscriptionConfig(
  organizationId: string
): Promise<void> {
  await getDb()
    .delete(schema.voiceTranscriptionCredentials)
    .where(
      scoped(
        schema.voiceTranscriptionCredentials.organizationId,
        organizationId
      )
    );
  await borrarCache(organizationId);
}

async function borrarCache(organizationId: string): Promise<void> {
  await getDb()
    .delete(schema.voiceTranscriptionCache)
    .where(
      scoped(schema.voiceTranscriptionCache.organizationId, organizationId)
    );
}
