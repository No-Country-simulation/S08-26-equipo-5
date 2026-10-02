import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    port: 4000,
    nodeEnv: "test",
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
    rateLimitForgotMax: 5,
    rateLimitTokenMax: 30,
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
const TOKEN = "B".repeat(43);

const MENSAJE_FORGOT =
  "Si el email está registrado, te enviamos un enlace para restablecer la contraseña.";

beforeEach(() => {
  vi.clearAllMocks();
  m.findByEmailInsensitive.mockReset();
  m.crearReemplazando.mockResolvedValue(undefined);
  m.mailSend.mockResolvedValue(undefined);
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("email faltante: 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(m.findByEmailInsensitive).not.toHaveBeenCalled();
  });

  it("email con formato inválido: 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "no-es-un-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("email de más de 254 caracteres: 400 sin tocar la base", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: `${"a".repeat(250)}@x.com` });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(m.findByEmailInsensitive).not.toHaveBeenCalled();
  });

  it("email registrado: 200 con el mensaje genérico y manda el correo", async () => {
    m.findByEmailInsensitive.mockResolvedValue({ id: "u1", nombre: "Ana", email: "ana@x.com" });

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ana@x.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: MENSAJE_FORGOT });
    // El trabajo corre en segundo plano, después de responder.
    await vi.waitFor(() => expect(m.mailSend).toHaveBeenCalledTimes(1));
    expect(m.crearReemplazando).toHaveBeenCalledTimes(1);
  });

  it("responde sin esperar a la base: el tiempo no depende de si la cuenta existe", async () => {
    m.findByEmailInsensitive.mockReturnValue(new Promise(() => undefined));

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "lento@x.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: MENSAJE_FORGOT });
  });

  it("email inexistente: exactamente la misma respuesta 200 y sin correo", async () => {
    m.findByEmailInsensitive.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nadie@x.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: MENSAJE_FORGOT });
    await vi.waitFor(() => expect(m.findByEmailInsensitive).toHaveBeenCalled());
    expect(m.crearReemplazando).not.toHaveBeenCalled();
    expect(m.mailSend).not.toHaveBeenCalled();
  });

  it("si el proveedor de correo falla igual responde 200", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    m.findByEmailInsensitive.mockResolvedValue({ id: "u1", nombre: "Ana", email: "ana@x.com" });
    m.mailSend.mockRejectedValue(new Error("caído"));

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ana@x.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: MENSAJE_FORGOT });
    await vi.waitFor(() => expect(m.mailSend).toHaveBeenCalled());
  });
});

describe("GET /api/v1/auth/reset-password/:token", () => {
  it("token válido: 200 con email enmascarado, sin pedir sesión", async () => {
    m.findValidoByTokenHash.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });

    const res = await request(app).get(`/api/v1/auth/reset-password/${TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valido: true, emailEnmascarado: "a***@x.com" });
  });

  it("token desconocido/vencido/usado: 410 RESET_TOKEN_INVALID", async () => {
    m.findValidoByTokenHash.mockResolvedValue(null);

    const res = await request(app).get(`/api/v1/auth/reset-password/${TOKEN}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
    expect(typeof res.body.error.message).toBe("string");
  });
});

describe("POST /api/v1/auth/reset-password/:token", () => {
  it("password faltante: 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post(`/api/v1/auth/reset-password/${TOKEN}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(m.consumirYCambiarPassword).not.toHaveBeenCalled();
  });

  it("password corta (misma regla que register, mínimo 8): 400", async () => {
    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${TOKEN}`)
      .send({ password: "corta12" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("password de más de 72 bytes UTF-8 (aunque tenga menos de 72 caracteres): 400", async () => {
    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${TOKEN}`)
      .send({ password: "ñ".repeat(37) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.errors[0].mensaje).toBe("La contraseña no puede superar 72 bytes");
    expect(m.findValidoByTokenHash).not.toHaveBeenCalled();
  });

  it("register aplica los mismos topes (password > 72 bytes y email > 254)", async () => {
    const base = { nombre: "Ana", apellido: "P", email: "ana@x.com", password: "clave-valida-123" };

    const larga = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...base, password: "a".repeat(73) });
    const emailLargo = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...base, email: `${"a".repeat(250)}@x.com` });

    expect(larga.status).toBe(400);
    expect(larga.body.error.errors[0].mensaje).toBe("La contraseña no puede superar 72 bytes");
    expect(emailLargo.status).toBe(400);
  });

  it("token inválido: 410 RESET_TOKEN_INVALID", async () => {
    m.findValidoByTokenHash.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${TOKEN}`)
      .send({ password: "nueva-clave-123" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("token válido: 200 y no devuelve tokens de sesión", async () => {
    m.findValidoByTokenHash.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });
    m.consumirYCambiarPassword.mockResolvedValue({
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });

    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${TOKEN}`)
      .send({ password: "nueva-clave-123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Contraseña actualizada" });
  });

  it("segundo uso del mismo token: 410", async () => {
    m.findValidoByTokenHash.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });
    m.consumirYCambiarPassword.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/auth/reset-password/${TOKEN}`)
      .send({ password: "nueva-clave-123" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("RESET_TOKEN_INVALID");
  });
});
