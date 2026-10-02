import { vi } from "vitest";

// Fuera de NODE_ENV=test los limiters están activos: acá sí se puede ver el 429.
vi.mock("../config/env.js", () => ({
  env: {
    port: 4000,
    nodeEnv: "development",
    corsOrigin: "*",
    databaseUrl: "postgresql://test:test@localhost:5432/test",
    jwtSecret: "test-jwt-secret",
    jwtExpiresIn: "15m",
    refreshTokenTtlDays: 7,
    bcryptSaltRounds: 4,
    frontendUrl: "http://front.test",
    getstreamApiKey: "test-stream-key",
    getstreamApiSecret: "test-stream-secret",
    streamTokenTtlSeconds: 3600,
    participantTokenTtlSeconds: 7200,
    passwordResetTtlMinutes: 30,
    rateLimitForgotMax: 2,
    rateLimitTokenMax: 2,
    rateLimitInviteMax: 30,
  },
}));

const m = vi.hoisted(() => ({
  findByEmailInsensitive: vi.fn(),
  crearReemplazando: vi.fn(),
  findValidoByTokenHash: vi.fn(),
  consumirYCambiarPassword: vi.fn(),
  mailSend: vi.fn(),
}));

vi.mock("../config/prisma.js", () => ({ prisma: {} }));
vi.mock("../repositories/user.repository.js", () => ({
  PrismaUserRepository: class {
    findByEmailInsensitive = m.findByEmailInsensitive;
  },
}));
vi.mock("../repositories/refreshToken.repository.js", () => ({
  PrismaRefreshTokenRepository: class {},
}));
vi.mock("../repositories/passwordReset.repository.js", () => ({
  PrismaPasswordResetRepository: class {
    crearReemplazando = m.crearReemplazando;
    findValidoByTokenHash = m.findValidoByTokenHash;
    consumirYCambiarPassword = m.consumirYCambiarPassword;
  },
}));
vi.mock("../mail/index.js", () => ({
  getMailer: () => ({ send: m.mailSend }),
}));

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
  m.crearReemplazando.mockResolvedValue(undefined);
  m.mailSend.mockResolvedValue(undefined);
  m.findByEmailInsensitive.mockResolvedValue(null);
  m.findValidoByTokenHash.mockResolvedValue(null);
});

describe("rate limit de recuperar contraseña", () => {
  it("forgot-password: superado el tope por IP responde 429 RATE_LIMITED", async () => {
    const enviar = (email: string) =>
      request(app).post("/api/v1/auth/forgot-password").send({ email });

    await enviar("a1@x.com").expect(200);
    await enviar("a2@x.com").expect(200);
    const res = await enviar("a3@x.com");

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("reset-password/:token: superado el tope por IP responde 429 RATE_LIMITED", async () => {
    const url = `/api/v1/auth/reset-password/${"C".repeat(43)}`;

    await request(app).get(url).expect(410);
    await request(app).get(url).expect(410);
    const res = await request(app).get(url);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
