import { randomUUID } from "node:crypto";
import { and, eq, lte, ne, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { readMediaFile } from "@/server/whatsapp/media";
import {
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  transcribirAudio,
  validarAudioTranscripcion,
} from "@/server/transcription/provider";
import type { VoiceTranscriptionConfigSecret } from "@/server/transcription/credentials";

const CACHE_MS = 24 * 60 * 60 * 1000;
const ERROR_CACHE_MS = 5 * 60 * 1000;
const LEASE_MS = 15_000;
const MEDIA_READ_TIMEOUT_MS = 1_000;

export type EstadoTranscripcion =
  | { status: "ready"; text: string }
  | { status: "unavailable" };

export type MediaParaTranscripcion = {
  assetId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fetchStatus: "available" | "pending" | "failed" | null;
};

type CacheRow = typeof schema.voiceTranscriptionCache.$inferSelect;

async function leerMediaAcotada(
  organizationId: string,
  mediaAssetId: string
): Promise<Buffer | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      readMediaFile(organizationId, mediaAssetId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), MEDIA_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function cacheDe(
  organizationId: string,
  mediaAssetId: string
): Promise<CacheRow | null> {
  const rows = await getDb()
    .select()
    .from(schema.voiceTranscriptionCache)
    .where(
      scoped(
        schema.voiceTranscriptionCache.organizationId,
        organizationId,
        eq(schema.voiceTranscriptionCache.mediaAssetId, mediaAssetId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

function resultadoGuardado(row: CacheRow): EstadoTranscripcion | null {
  if (
    row.status !== "ready" ||
    !row.transcriptCipher ||
    !row.transcriptIv ||
    !row.transcriptTag
  ) {
    return null;
  }
  try {
    const text = decryptSecret({
      cipher: row.transcriptCipher,
      iv: row.transcriptIv,
      tag: row.transcriptTag,
    }).trim();
    return text ? { status: "ready", text } : null;
  } catch {
    return null;
  }
}

/**
 * Transcribe una nota únicamente cuando el dueño activó el conector. No
 * descarga de Meta: si el medio no está disponible en el almacenamiento
 * propio, el cerebro recibe el evento normal y conserva su mediaId.
 */
export async function transcribirMediaEntrante(
  organizationId: string,
  media: MediaParaTranscripcion,
  config: VoiceTranscriptionConfigSecret
): Promise<EstadoTranscripcion> {
  if (
    !config.enabled ||
    config.organizationId !== organizationId ||
    !media.assetId ||
    media.fetchStatus !== "available" ||
    !media.mimeType ||
    (media.fileSize !== null &&
      media.fileSize > MAX_TRANSCRIPTION_AUDIO_BYTES)
  ) {
    return { status: "unavailable" };
  }

  const now = new Date();
  const cache = await cacheDe(organizationId, media.assetId);
  if (cache && cache.expiresAt > now && cache.provider === config.provider) {
    if (cache.status === "ready") {
      const resultado = resultadoGuardado(cache);
      if (resultado) return resultado;
    } else if (
      cache.status === "failed" ||
      (cache.status === "processing" && cache.leaseUntil && cache.leaseUntil > now)
    ) {
      return { status: "unavailable" };
    }
  }

  const audio = await leerMediaAcotada(organizationId, media.assetId);
  if (!audio) return { status: "unavailable" };
  if (
    audio.length > MAX_TRANSCRIPTION_AUDIO_BYTES ||
    !validarAudioTranscripcion(audio, media.mimeType)
  ) {
    return { status: "unavailable" };
  }

  const leaseId = randomUUID();
  const leaseUntil = new Date(Date.now() + LEASE_MS);
  const db = getDb();
  const inserted = await db
    .insert(schema.voiceTranscriptionCache)
    .values({
      id: newId("voiceTranscriptionCache"),
      organizationId,
      mediaAssetId: media.assetId,
      provider: config.provider,
      status: "processing",
      leaseId,
      leaseUntil,
      expiresAt: leaseUntil,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        schema.voiceTranscriptionCache.organizationId,
        schema.voiceTranscriptionCache.mediaAssetId,
      ],
    })
    .returning();

  let tieneLease = inserted.length > 0;
  if (!tieneLease) {
    const claimed = await db
      .update(schema.voiceTranscriptionCache)
      .set({
        provider: config.provider,
        status: "processing",
        transcriptCipher: null,
        transcriptIv: null,
        transcriptTag: null,
        leaseId,
        leaseUntil,
        expiresAt: leaseUntil,
        updatedAt: now,
      })
      .where(
        scoped(
          schema.voiceTranscriptionCache.organizationId,
          organizationId,
          eq(schema.voiceTranscriptionCache.mediaAssetId, media.assetId),
          or(
            ne(schema.voiceTranscriptionCache.status, "processing"),
            lte(schema.voiceTranscriptionCache.leaseUntil, now),
            lte(schema.voiceTranscriptionCache.expiresAt, now),
            ne(schema.voiceTranscriptionCache.provider, config.provider)
          )
        )
      )
      .returning();
    tieneLease = claimed.length > 0;
  }

  if (!tieneLease) {
    const final = await cacheDe(organizationId, media.assetId);
    if (final?.provider === config.provider && final.expiresAt > new Date()) {
      const resultado = resultadoGuardado(final);
      if (resultado) return resultado;
    }
    return { status: "unavailable" };
  }

  let transcript: string | null = null;
  try {
    const valido = validarAudioTranscripcion(audio, media.mimeType);
    if (valido) {
      transcript = await transcribirAudio({
        provider: config.provider,
        token: config.token,
        audio,
        mimeType: valido.mimeType,
        fileName: valido.fileName,
      });
    }
  } catch {
    transcript = null;
  }

  if (transcript) {
    const encrypted = encryptSecret(transcript);
    const saved = await db
      .update(schema.voiceTranscriptionCache)
      .set({
        status: "ready",
        transcriptCipher: encrypted.cipher,
        transcriptIv: encrypted.iv,
        transcriptTag: encrypted.tag,
        leaseId: null,
        leaseUntil: null,
        expiresAt: new Date(Date.now() + CACHE_MS),
        updatedAt: new Date(),
      })
      .where(
        scoped(
          schema.voiceTranscriptionCache.organizationId,
          organizationId,
          and(
            eq(schema.voiceTranscriptionCache.mediaAssetId, media.assetId),
            eq(schema.voiceTranscriptionCache.leaseId, leaseId)
          )
        )
      )
      .returning({ id: schema.voiceTranscriptionCache.id });
    return saved.length ? { status: "ready", text: transcript } : { status: "unavailable" };
  }

  await db
    .update(schema.voiceTranscriptionCache)
    .set({
      status: "failed",
      transcriptCipher: null,
      transcriptIv: null,
      transcriptTag: null,
      leaseId: null,
      leaseUntil: null,
      expiresAt: new Date(Date.now() + ERROR_CACHE_MS),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.voiceTranscriptionCache.organizationId,
        organizationId,
        and(
          eq(schema.voiceTranscriptionCache.mediaAssetId, media.assetId),
          eq(schema.voiceTranscriptionCache.leaseId, leaseId)
        )
      )
    );
  return { status: "unavailable" };
}
