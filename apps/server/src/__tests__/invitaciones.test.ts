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
    bcryptSaltRounds: 12,
    frontendUrl: "http://front.test",
    getstreamApiKey: "test-stream-key",
    getstreamApiSecret: "test-stream-secret",
    streamTokenTtlSeconds: 3600,
    participantTokenTtlSeconds: 7200,
    webhookVerifySignature: false,
    invitacionTtlHoras: 72,
    mailProvider: "console",
    mailFrom: "onboarding@resend.dev",
    rateLimitInviteMax: 30,
    rateLimitTokenMax: 30,
  },
}));

const m = vi.hoisted(() => ({
  salaFindUnique: vi.fn(),
  participanteFindFirst: vi.fn(),
  participanteFindUnique: vi.fn(),
  participanteCreate: vi.fn(),
  invitacionUpdate: vi.fn(),
  invitacionFindUnique: vi.fn(),
  usuarioFindFirst: vi.fn(),
  mailSend: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: { findUnique: m.salaFindUnique },
    participante: {
      findFirst: m.participanteFindFirst,
      findUnique: m.participanteFindUnique,
      create: m.participanteCreate,
    },
    invitacion: { update: m.invitacionUpdate, findUnique: m.invitacionFindUnique },
    usuario: { findFirst: m.usuarioFindFirst },
  })),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
    INVITADO: "INVITADO",
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

vi.mock("../mail/index.js", () => ({
  getMailer: () => ({ send: m.mailSend }),
}));

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { hashInvitationToken } from "../utils/invitationToken.js";

const app = createApp();

const SALA_ID = "11111111-1111-1111-1111-111111111111";
const HOST_ID = "44444444-4444-4444-4444-444444444444";

const sala = { id: SALA_ID, codigo: "ABCD1234", nombre: "Reunión Q4", estado: "ACTIVA" };

function userToken(userId = HOST_ID) {
  return jwt.sign({ sub: userId, email: "host@test.com" }, "test-jwt-secret", {
    expiresIn: "15m",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.salaFindUnique.mockResolvedValue(sala);
  // findHost usa findFirst con rol HOST; findByEmail también usa findFirst.
  m.participanteFindFirst.mockImplementation(async ({ where }: any) =>
    where.rol === "HOST" ? { id: "p-host", usuarioId: HOST_ID, rol: "HOST" } : null,
  );
  m.participanteFindUnique.mockResolvedValue(null);
  m.usuarioFindFirst.mockResolvedValue(null);
  m.participanteCreate.mockResolvedValue({ id: "p-new" });
  m.mailSend.mockResolvedValue(undefined);
});

describe("POST /api/v1/salas/:id/invitaciones", () => {
  const url = `/api/v1/salas/${SALA_ID}/invitaciones`;

  it("401 — sin JWT", async () => {
    const res = await request(app).post(url).send({ emails: ["a@x.com"] });
    expect(res.status).toBe(401);
    expect(m.participanteCreate).not.toHaveBeenCalled();
  });

  it("403 — autenticado pero no host, sin filas", async () => {
    m.participanteFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken("otro")}`)
      .send({ emails: ["a@x.com"] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("HOST_ONLY");
    expect(m.participanteCreate).not.toHaveBeenCalled();
    expect(m.mailSend).not.toHaveBeenCalled();
  });

  it("404 — sala inexistente", async () => {
    m.salaFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ emails: ["a@x.com"] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROOM_NOT_FOUND");
  });

  it.each([
    ["vacio", { emails: [] }],
    ["sin campo", {}],
    ["formato invalido", { emails: ["nope"] }],
    ["demasiados", { emails: Array.from({ length: 21 }, (_, i) => `u${i}@x.com`) }],
  ])("400 — emails %s", async (_n, body) => {
    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken()}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(m.participanteCreate).not.toHaveBeenCalled();
  });

  it("200 — resultados por email; el token nunca esta en DB ni en la respuesta", async () => {
    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ emails: ["A@x.com", "a@x.com"] });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([
      { email: "a@x.com", estado: "INVITADO", emailEnviado: true },
    ]);

    // Token en claro solo dentro del correo; en DB solo el hash.
    const mail = m.mailSend.mock.calls[0][0];
    const token = /\/invitacion\/([\w-]+)/.exec(mail.text)![1];
    const dbData = m.participanteCreate.mock.calls[0][0].data;
    expect(dbData.invitacion.create.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(m.participanteCreate.mock.calls)).not.toContain(token);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it("200 — el mail falla: sigue 200 y las filas persisten", async () => {
    m.mailSend.mockRejectedValue(new Error("resend caido"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ emails: ["a@x.com"] });

    expect(res.status).toBe(200);
    expect(m.participanteCreate).toHaveBeenCalledTimes(1);
    expect(res.body.resultados[0].emailEnviado).toBe(false);
  });

  it("200 — registrado y no registrado tienen la misma forma de resultado", async () => {
    m.usuarioFindFirst.mockImplementation(async ({ where }: any) =>
      where.email.equals === "ana@x.com"
        ? {
            id: "u-1",
            nombre: "Ana",
            apellido: "Paz",
            email: "Ana@x.com",
            passwordHash: "h",
          }
        : null,
    );

    const res = await request(app)
      .post(url)
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ emails: ["ana@x.com", "nuevo@x.com"] });

    expect(res.status).toBe(200);
    const [a, b] = res.body.resultados;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.estado).toBe(b.estado);
    expect(m.participanteCreate.mock.calls[0][0].data.usuarioId).toBe("u-1");
    expect(m.participanteCreate.mock.calls[1][0].data.usuarioId).toBeNull();
  });
});

describe("GET /api/v1/invitaciones/:token", () => {
  const token = "token-de-prueba";

  function invitacion(over: Record<string, unknown> = {}, part: Record<string, unknown> = {}) {
    return {
      id: "i-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      participante: {
        id: "p-1",
        email: "a@x.com",
        usuarioId: null,
        estado: "INVITADO",
        sala,
        ...part,
      },
      ...over,
    };
  }

  it("200 — público, busca por hash y no consume (dos GET seguidos)", async () => {
    m.invitacionFindUnique.mockResolvedValue(invitacion());

    const r1 = await request(app).get(`/api/v1/invitaciones/${token}`);
    const r2 = await request(app).get(`/api/v1/invitaciones/${token}`);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toEqual({
      sala: { id: SALA_ID, nombre: "Reunión Q4" },
      email: "a***@x.com",
      requiereDatos: true,
      requiereLogin: false,
    });
    expect(m.invitacionFindUnique.mock.calls[0][0].where.tokenHash).toBe(
      hashInvitationToken(token),
    );
    expect(JSON.stringify(r1.body)).not.toContain(token);
  });

  it("200 — invitado registrado: requiereLogin", async () => {
    m.invitacionFindUnique.mockResolvedValue(invitacion({}, { usuarioId: "u-1" }));

    const res = await request(app).get(`/api/v1/invitaciones/${token}`);

    expect(res.body.requiereLogin).toBe(true);
    expect(res.body.requiereDatos).toBe(false);
  });

  it.each([
    ["desconocido", null],
    ["expirado", invitacion({ expiresAt: new Date(Date.now() - 1000) })],
    ["usado", invitacion({ usedAt: new Date() })],
  ])("410 INVITATION_INVALID — %s (mismo cuerpo)", async (_n, inv) => {
    m.invitacionFindUnique.mockResolvedValue(inv);

    const res = await request(app).get(`/api/v1/invitaciones/${token}`);

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_INVALID");
  });
});
