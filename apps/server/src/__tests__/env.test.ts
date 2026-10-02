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
    vi.stubEnv("BREVO_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");
    vi.stubEnv("INVITACION_TTL_HORAS", "");
    vi.stubEnv("RATE_LIMIT_INVITE_MAX", "");
    vi.stubEnv("RATE_LIMIT_TOKEN_MAX", "");
    vi.stubEnv("PASSWORD_RESET_TTL_MINUTES", "");
    vi.stubEnv("RATE_LIMIT_FORGOT_MAX", "");
    vi.stubEnv("TRUST_PROXY", "");
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

  it("brevo con API key expone provider y clave", async () => {
    vi.stubEnv("MAIL_PROVIDER", "brevo");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-123");

    const env = await cargarEnv();

    expect(env.mailProvider).toBe("brevo");
    expect(env.brevoApiKey).toBe("xkeysib-123");
  });

  it("brevo sin BREVO_API_KEY falla al arrancar", async () => {
    vi.stubEnv("MAIL_PROVIDER", "brevo");

    await expect(cargarEnv()).rejects.toThrow(/BREVO_API_KEY/);
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

  it("recuperación de contraseña: TTL 30 min y límite 5 por defecto", async () => {
    const env = await cargarEnv();

    expect(env.passwordResetTtlMinutes).toBe(30);
    expect(env.rateLimitForgotMax).toBe(5);
  });

  it("recuperación de contraseña: respeta los valores configurados", async () => {
    vi.stubEnv("PASSWORD_RESET_TTL_MINUTES", "10");
    vi.stubEnv("RATE_LIMIT_FORGOT_MAX", "3");

    const env = await cargarEnv();

    expect(env.passwordResetTtlMinutes).toBe(10);
    expect(env.rateLimitForgotMax).toBe(3);
  });

  it.each(["0", "-1", "abc"])(
    "PASSWORD_RESET_TTL_MINUTES inválido (%s) falla al arrancar",
    async (valor) => {
      vi.stubEnv("PASSWORD_RESET_TTL_MINUTES", valor);

      await expect(cargarEnv()).rejects.toThrow(/PASSWORD_RESET_TTL_MINUTES/);
    },
  );

  it("RATE_LIMIT_FORGOT_MAX inválido falla al arrancar", async () => {
    vi.stubEnv("RATE_LIMIT_FORGOT_MAX", "0");

    await expect(cargarEnv()).rejects.toThrow(/RATE_LIMIT_FORGOT_MAX/);
  });

  describe("TRUST_PROXY", () => {
    it("por defecto es false fuera de producción", async () => {
      expect((await cargarEnv()).trustProxy).toBe(false);
    });

    it("por defecto es 1 salto en producción", async () => {
      vi.stubEnv("NODE_ENV", "production");
      expect((await cargarEnv()).trustProxy).toBe(1);
    });

    it.each([
      ["2", 2],
      ["true", true],
      ["false", false],
      ["10.0.0.0/8", "10.0.0.0/8"],
      ["loopback, 10.0.0.1", "loopback,10.0.0.1"],
    ])("acepta %s", async (valor, esperado) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUST_PROXY", valor);
      expect((await cargarEnv()).trustProxy).toBe(esperado);
    });

    it("un valor explícito pisa el default de producción", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("TRUST_PROXY", "false");
      expect((await cargarEnv()).trustProxy).toBe(false);
    });

    it.each(["0", "-1", "1.5"])("número inválido (%s) falla al arrancar", async (valor) => {
      vi.stubEnv("TRUST_PROXY", valor);
      await expect(cargarEnv()).rejects.toThrow(/TRUST_PROXY/);
    });
  });
});
