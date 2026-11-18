import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cacheRows: Record<string, unknown>[] = [];
const lectura = vi.fn();
const provider = vi.fn();
const audio = Buffer.from(`OggS${"x".repeat(16)}`);

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(cacheRows.slice()),
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            const exists = cacheRows.some(
              (row) =>
                row.organizationId === value.organizationId &&
                row.mediaAssetId === value.mediaAssetId
            );
            if (exists) return Promise.resolve([]);
            cacheRows.push(value);
            return Promise.resolve([value]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          const apply = () => {
            const current = cacheRows[0];
            if (!current) return Promise.resolve([]);
            if (
              value.status === "processing" &&
              current.status === "processing" &&
              (current.leaseUntil as Date) > new Date()
            ) {
              return Promise.resolve([]);
            }
            Object.assign(current, value);
            return [current];
          };
          return {
            returning: () => Promise.resolve(apply()),
            then: (resolve: (value: unknown) => void) =>
              Promise.resolve(apply()).then(resolve),
          };
        },
      }),
    }),
  }),
  schema: {
    voiceTranscriptionCache: {
      organizationId: "organization_id",
      mediaAssetId: "media_asset_id",
      status: "status",
      leaseUntil: "lease_until",
      expiresAt: "expires_at",
      provider: "provider",
      leaseId: "lease_id",
      id: "id",
    },
  },
}));

vi.mock("@/server/whatsapp/media", () => ({
  readMediaFile: lectura,
}));

vi.mock("@/server/transcription/provider", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/transcription/provider")
  >("@/server/transcription/provider");
  return {
    ...actual,
    transcribirAudio: provider,
  };
});

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET = "secreto-de-prueba-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  cacheRows.length = 0;
  lectura.mockReset().mockResolvedValue(audio);
  provider.mockReset().mockResolvedValue("Texto sensible transcrito.");
});

const config = {
  organizationId: "org_1",
  provider: "openai" as const,
  enabled: true,
  token: "token-de-prueba",
  tokenLast4: "ueba",
  updatedAt: new Date(),
};

const media = {
  assetId: "ma_1",
  mimeType: "audio/ogg; codecs=opus",
  fileSize: audio.length,
  fetchStatus: "available" as const,
};

describe("cache de transcripción cifrada e idempotente", () => {
  it("una media no disponible se degrada sin leer disco ni llamar al proveedor", async () => {
    const { transcribirMediaEntrante } = await import(
      "@/server/transcription/transcribir"
    );
    await expect(
      transcribirMediaEntrante(
        "org_1",
        { ...media, fetchStatus: "pending" },
        config
      )
    ).resolves.toEqual({ status: "unavailable" });
    expect(lectura).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("dos reclamos concurrentes hacen una sola llamada y guardan el texto cifrado", async () => {
    const { transcribirMediaEntrante } = await import(
      "@/server/transcription/transcribir"
    );
    const [primero, segundo] = await Promise.all([
      transcribirMediaEntrante("org_1", media, config),
      transcribirMediaEntrante("org_1", media, config),
    ]);

    expect([primero.status, segundo.status]).toContain("ready");
    expect(["ready", "unavailable"]).toContain(segundo.status);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(cacheRows[0])).not.toContain(
      "Texto sensible transcrito."
    );
    expect(cacheRows[0]).toMatchObject({ status: "ready", provider: "openai" });

    await expect(
      transcribirMediaEntrante("org_1", media, config)
    ).resolves.toEqual({
      status: "ready",
      text: "Texto sensible transcrito.",
    });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("nunca reutiliza datos de otro tenant", async () => {
    const { transcribirMediaEntrante } = await import(
      "@/server/transcription/transcribir"
    );
    await expect(
      transcribirMediaEntrante("org_otro", media, config)
    ).resolves.toEqual({ status: "unavailable" });
    expect(provider).not.toHaveBeenCalled();
    expect(lectura).not.toHaveBeenCalled();
  });

  it("cachea fallos breves para no repetir llamadas externas en el reintento", async () => {
    provider.mockResolvedValue(null);
    const { transcribirMediaEntrante } = await import(
      "@/server/transcription/transcribir"
    );
    await expect(
      transcribirMediaEntrante("org_1", media, config)
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      transcribirMediaEntrante("org_1", media, config)
    ).resolves.toEqual({ status: "unavailable" });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(cacheRows[0]).toMatchObject({ status: "failed" });
  });
});
