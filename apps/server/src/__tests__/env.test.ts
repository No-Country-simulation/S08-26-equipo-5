import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env.ts evalúa process.env al importarse: cada caso resetea módulos y
// re-importa con las variables stubeadas.
async function cargarEnv() {
  vi.resetModules();
  return (await import("../config/env.js")).env;
}

describe("config/env — invitaciones y mail", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
    vi.stubEnv("JWT_SECRET", "test-jwt-secret");
    vi.stubEnv("GETSTREAM_API_KEY", "test-stream-key");
    vi.stubEnv("GETSTREAM_API_SECRET", "test-stream-secret");
    // Cadena vacía = "no definida" y dotenv no pisa variables ya presentes,
    // así un .env local no contamina los defaults bajo prueba.
    vi.stubEnv("MAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.stubEnv("INVITACION_TTL_HORAS", "");
    vi.stubEnv("RATE_LIMIT_INVITE_MAX", "");
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("aplica los defaults: provider console, TTL 72h, remitente de Resend y límites 30", async () => {
    const env = await cargarEnv();

    expect(env.mailProvider).toBe("console");
    expect(env.invitacionTtlHoras).toBe(72);
    expect(env.mailFrom).toBe("onboarding@resend.dev");
    expect(env.resendApiKey).toBeUndefined();
    expect(env.rateLimitInviteMax).toBe(30);
    expect(env.rateLimitTokenMax).toBe(30);
  });

  it("respeta los valores configurados", async () => {
    vi.stubEnv("INVITACION_TTL_HORAS", "24");
    vi.stubEnv("MAIL_FROM", "MeetFlow <hola@meetflow.app>");
    vi.stubEnv("RATE_LIMIT_INVITE_MAX", "5");
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX", "7");

    const env = await cargarEnv();

    expect(env.invitacionTtlHoras).toBe(24);
    expect(env.mailFrom).toBe("MeetFlow <hola@meetflow.app>");
    expect(env.rateLimitInviteMax).toBe(5);
    expect(env.rateLimitTokenMax).toBe(7);
  });

  it("resend con API key expone provider y clave", async () => {
    vi.stubEnv("MAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");

    const env = await cargarEnv();

    expect(env.mailProvider).toBe("resend");
    expect(env.resendApiKey).toBe("re_test_123");
  });

  it("resend sin RESEND_API_KEY falla al arrancar", async () => {
    vi.stubEnv("MAIL_PROVIDER", "resend");

    await expect(cargarEnv()).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("un MAIL_PROVIDER desconocido falla al arrancar", async () => {
    vi.stubEnv("MAIL_PROVIDER", "sendgrid");

    await expect(cargarEnv()).rejects.toThrow(/MAIL_PROVIDER/);
  });

  it.each(["0", "-3", "abc"])(
    "INVITACION_TTL_HORAS inválido (%s) falla al arrancar",
    async (valor) => {
      vi.stubEnv("INVITACION_TTL_HORAS", valor);

      await expect(cargarEnv()).rejects.toThrow(/INVITACION_TTL_HORAS/);
    },
  );
});
