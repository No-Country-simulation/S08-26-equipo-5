import { vi } from "vitest";

// Mutable: cada test fija trustProxy antes de crear la app.
const envMock = vi.hoisted(() => ({
  port: 4000,
  nodeEnv: "development",
  corsOrigin: "*",
  databaseUrl: "postgresql://test:test@localhost:5432/test",
  jwtSecret: "test-jwt-secret",
  jwtExpiresIn: "15m",
  refreshTokenTtlDays: 7,
  bcryptSaltRounds: 4,
  frontendUrl: "http://front.test",
  getstreamApiKey: "k",
  getstreamApiSecret: "s",
  streamTokenTtlSeconds: 3600,
  participantTokenTtlSeconds: 7200,
  passwordResetTtlMinutes: 30,
  rateLimitForgotMax: 2,
  rateLimitTokenMax: 30,
  rateLimitInviteMax: 30,
  trustProxy: 1 as number | boolean | string,
}));
vi.mock("../config/env.js", () => ({ env: envMock }));

vi.mock("../config/prisma.js", () => ({ prisma: {} }));
vi.mock("../repositories/user.repository.js", () => ({
  PrismaUserRepository: class {
    findByEmailInsensitive = vi.fn().mockResolvedValue(null);
  },
}));
vi.mock("../repositories/refreshToken.repository.js", () => ({
  PrismaRefreshTokenRepository: class {},
}));
vi.mock("../repositories/passwordReset.repository.js", () => ({
  PrismaPasswordResetRepository: class {},
}));
vi.mock("../mail/index.js", () => ({ getMailer: () => ({ send: vi.fn() }) }));

import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const forgot = (app: ReturnType<typeof createApp>, ip: string, email: string) =>
  request(app).post("/api/v1/auth/forgot-password").set("X-Forwarded-For", ip).send({ email });

describe("trust proxy", () => {
  it("con trust proxy=1 cada X-Forwarded-For tiene su propio contador por IP", async () => {
    envMock.trustProxy = 1;
    const app = createApp();

    await forgot(app, "203.0.113.1", "a1@x.com").expect(200);
    await forgot(app, "203.0.113.1", "a2@x.com").expect(200);
    await forgot(app, "203.0.113.1", "a3@x.com").expect(429);
    // Otro cliente detrás del mismo proxy no se ve afectado.
    await forgot(app, "203.0.113.2", "b1@x.com").expect(200);
  });

  it("con trust proxy=false todos comparten la IP del proxy (contador global)", async () => {
    envMock.trustProxy = false;
    const app = createApp();

    await forgot(app, "198.51.100.1", "c1@x.com").expect(200);
    await forgot(app, "198.51.100.2", "c2@x.com").expect(200);
    await forgot(app, "198.51.100.3", "c3@x.com").expect(429);
  });
});
