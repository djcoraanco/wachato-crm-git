import { lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

const INTERVALO_LIMPIEZA_MS = 60 * 60 * 1000;
const globalParaLimpieza = globalThis as unknown as {
  __voceroTranscriptionCacheCleanup?: NodeJS.Timeout;
};

export async function limpiarCacheTranscripcionExpirada(): Promise<void> {
  const db = getDb();
  const ahora = new Date();
  const tenants = await db
    .selectDistinct({ organizationId: schema.voiceTranscriptionCache.organizationId })
    .from(schema.voiceTranscriptionCache)
    .where(lte(schema.voiceTranscriptionCache.expiresAt, ahora));

  for (const tenant of tenants) {
    await db
      .delete(schema.voiceTranscriptionCache)
      .where(
        scoped(
          schema.voiceTranscriptionCache.organizationId,
          tenant.organizationId,
          lte(schema.voiceTranscriptionCache.expiresAt, ahora)
        )
      );
  }
}

export function iniciarLimpiezaCacheTranscripcion(): void {
  if (globalParaLimpieza.__voceroTranscriptionCacheCleanup) return;
  const barrer = () => {
    void limpiarCacheTranscripcionExpirada().catch(() => {});
  };
  barrer();
  globalParaLimpieza.__voceroTranscriptionCacheCleanup = setInterval(
    barrer,
    INTERVALO_LIMPIEZA_MS
  );
  globalParaLimpieza.__voceroTranscriptionCacheCleanup.unref?.();
}
