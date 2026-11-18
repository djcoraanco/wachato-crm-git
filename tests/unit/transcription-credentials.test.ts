import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
const deleted: unknown[] = [];
let current: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(current),
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value);
        return {
          onConflictDoUpdate: () => ({
            returning: () => {
              const row = {
                ...value,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              current = [row];
              return Promise.resolve([row]);
            },
          }),
        };
      },
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        updated.push(value);
        return {
          where: () => ({
            returning: () => {
              current = current.map((row) => ({ ...row, ...value }));
              return Promise.resolve(current);
            },
          }),
        };
      },
    }),
    delete: () => ({
      where: () => {
        deleted.push(true);
        return Promise.resolve([]);
      },
    }),
  }),
  schema: {
    voiceTranscriptionCredentials: {
      organizationId: "organization_id",
    },
    voiceTranscriptionCache: {
      organizationId: "organization_id",
    },
  },
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.BETTER_AUTH_SECRET = "secreto-de-prueba-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  inserted.length = 0;
  updated.length = 0;
  deleted.length = 0;
  current = [];
});

describe("credenciales de transcripción", () => {
  it("cifra la llave y solo expone proveedor, activación y últimos cuatro", async () => {
    const {
      saveVoiceTranscriptionConfig,
      getVoiceTranscriptionSecret,
    } = await import(
      "@/server/transcription/credentials"
    );
    const token = "sk-test-llave-privada-1234";
    const config = await saveVoiceTranscriptionConfig({
      organizationId: "org_1",
      provider: "openai",
      enabled: false,
      token,
    });

    expect(config).toMatchObject({
      provider: "openai",
      enabled: false,
      tokenLast4: "1234",
    });
    expect(JSON.stringify(inserted[0])).not.toContain(token);
    expect(inserted[0]).toMatchObject({
      tokenLast4: "1234",
      enabled: false,
    });
    expect(String(inserted[0]?.id)).toMatch(/^vtcred_/);

    const { decryptSecret } = await import("@/lib/crypto");
    expect(
      decryptSecret({
        cipher: inserted[0]?.tokenCipher as string,
        iv: inserted[0]?.tokenIv as string,
        tag: inserted[0]?.tokenTag as string,
      })
    ).toBe(token);
    expect(JSON.stringify(config)).not.toContain(token);
    expect(config).not.toHaveProperty("tokenCipher");
    expect(deleted).toHaveLength(1);
    await expect(getVoiceTranscriptionSecret("org_1")).resolves.toMatchObject({
      token,
      enabled: false,
    });
  });

  it("no permite activar sin credencial y no expone secretos al leer", async () => {
    const {
      VoiceTranscriptionConfigError,
      saveVoiceTranscriptionConfig,
      getVoiceTranscriptionSecret,
    } = await import("@/server/transcription/credentials");

    await expect(
      saveVoiceTranscriptionConfig({
        organizationId: "org_1",
        provider: "groq",
        enabled: true,
      })
    ).rejects.toBeInstanceOf(VoiceTranscriptionConfigError);
    expect(inserted).toHaveLength(0);

    current = [
      {
        id: "vtcred_1",
        organizationId: "org_1",
        provider: "groq",
        enabled: false,
        tokenCipher: "cipher",
        tokenIv: "iv",
        tokenTag: "tag",
        tokenLast4: "4321",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    await expect(getVoiceTranscriptionSecret("org_1")).rejects.toThrow();
  });

  it("conserva la llave cifrada al cambiar solo el interruptor", async () => {
    current = [
      {
        id: "vtcred_1",
        organizationId: "org_1",
        provider: "openai",
        enabled: false,
        tokenCipher: "cipher",
        tokenIv: "iv",
        tokenTag: "tag",
        tokenLast4: "4321",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const { saveVoiceTranscriptionConfig } = await import(
      "@/server/transcription/credentials"
    );
    const config = await saveVoiceTranscriptionConfig({
      organizationId: "org_1",
      provider: "openai",
      enabled: true,
    });
    expect(config?.enabled).toBe(true);
    expect(updated[0]).toEqual(expect.objectContaining({ enabled: true }));
    expect(updated[0]).not.toHaveProperty("tokenCipher");
    expect(deleted).toHaveLength(1);
  });
});
