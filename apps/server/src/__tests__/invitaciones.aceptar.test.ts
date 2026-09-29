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
  invitacionFindUnique: vi.fn(),
  txInvitacionUpdateMany: vi.fn(),
  txParticipanteUpdateMany: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    invitacion: { findUnique: m.invitacionFindUnique },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        invitacion: { updateMany: m.txInvitacionUpdateMany },
        participante: { updateMany: m.txParticipanteUpdateMany },
      }),
  })),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
    INVITADO: "INVITADO",
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { setReunionesNamespace } from "../realtime/registry.js";
import { hashInvitationToken } from "../utils/invitationToken.js";
import { verifyParticipantToken } from "../utils/participantToken.js";

const app = createApp();

const SALA_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN = "token-de-prueba";
const URL = `/api/v1/invitaciones/${TOKEN}/aceptar`;

const sala = { id: SALA_ID, codigo: "ABCD1234", nombre: "Reunión Q4", estado: "ACTIVA" };

function invitacion(part: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return {
    id: "i-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    participante: {
      id: "p-1",
      salaId: SALA_ID,
      email: "a@x.com",
      usuarioId: null,
      nombre: null,
      apellido: null,
      rol: "PARTICIPANTE",
      estado: "INVITADO",
      sala,
      ...part,
    },
    ...over,
  };
}

function userToken(userId: string) {
  return jwt.sign({ sub: userId, email: "u@test.com" }, "test-jwt-secret", {
    expiresIn: "15m",
  });
}

describe("POST /api/v1/invitaciones/:token/aceptar", () => {
  const emit = vi.fn();
  const to = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    to.mockReturnValue({ emit });
    setReunionesNamespace({ to } as never);
    m.invitacionFindUnique.mockResolvedValue(invitacion());
    m.txInvitacionUpdateMany.mockResolvedValue({ count: 1 });
    m.txParticipanteUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("200 — no registrado: PENDIENTE, accessToken guest, join:pending al host; el email del body se ignora", async () => {
    const res = await request(app)
      .post(URL)
      .send({ nombre: "Ana", apellido: "Pérez", email: "otro@x.com" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      participanteId: "p-1",
      estado: "PENDIENTE",
      salaId: SALA_ID,
    });
    expect(verifyParticipantToken(res.body.accessToken)).toMatchObject({
      sub: "p-1",
      salaId: SALA_ID,
    });
    // El token de la invitación nunca vuelve en la respuesta.
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);

    expect(m.invitacionFindUnique.mock.calls[0][0].where.tokenHash).toBe(
      hashInvitationToken(TOKEN),
    );
    expect(m.txParticipanteUpdateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE", nombre: "Ana", apellido: "Pérez" },
    });
    expect(to).toHaveBeenCalledWith(`sala:${SALA_ID}:host`);
    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({ participanteId: "p-1", email: "a@x.com", nombre: "Ana" }),
    );
  });

  it("400 — falta nombre/apellido y NO se consume el token", async () => {
    const res = await request(app).post(URL).send({ nombre: "Ana" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(m.txInvitacionUpdateMany).not.toHaveBeenCalled();
    expect(m.txParticipanteUpdateMany).not.toHaveBeenCalled();
  });

  it("400 — sin body", async () => {
    const res = await request(app).post(URL);
    expect(res.status).toBe(400);
  });

  describe("invitado registrado", () => {
    beforeEach(() => {
      m.invitacionFindUnique.mockResolvedValue(
        invitacion({ usuarioId: "u-1", nombre: "Ana", apellido: "Paz" }),
      );
    });

    it("401 LOGIN_REQUIRED sin JWT", async () => {
      const res = await request(app).post(URL).send({});

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("LOGIN_REQUIRED");
      expect(m.txInvitacionUpdateMany).not.toHaveBeenCalled();
    });

    it("403 INVITATION_ACCOUNT_MISMATCH con el JWT de otra cuenta", async () => {
      const res = await request(app)
        .post(URL)
        .set("Authorization", `Bearer ${userToken("u-2")}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("INVITATION_ACCOUNT_MISMATCH");
      expect(m.txInvitacionUpdateMany).not.toHaveBeenCalled();
    });

    it("200 con el JWT correcto y sin body; ignora nombre/apellido del body", async () => {
      const res = await request(app)
        .post(URL)
        .set("Authorization", `Bearer ${userToken("u-1")}`)
        .send({ nombre: "Impostor", apellido: "Falso" });

      expect(res.status).toBe(200);
      expect(res.body.estado).toBe("PENDIENTE");
      expect(m.txParticipanteUpdateMany).toHaveBeenCalledWith({
        where: { id: "p-1", estado: "INVITADO" },
        data: { estado: "PENDIENTE" },
      });
      expect(emit).toHaveBeenCalledWith(
        "join:pending",
        expect.objectContaining({ nombre: "Ana", apellido: "Paz" }),
      );
    });
  });

  it.each([
    ["desconocido", null],
    ["usado", invitacion({}, { usedAt: new Date() })],
    ["expirado", invitacion({}, { expiresAt: new Date(Date.now() - 1000) })],
  ])("410 INVITATION_INVALID — %s (mismo cuerpo)", async (_n, inv) => {
    m.invitacionFindUnique.mockResolvedValue(inv);

    const res = await request(app).post(URL).send({ nombre: "Ana", apellido: "Pérez" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_INVALID");
    expect(emit).not.toHaveBeenCalled();
  });

  it("410 — perdió la carrera (updateMany de la invitación count 0), sin evento", async () => {
    m.txInvitacionUpdateMany.mockResolvedValue({ count: 0 });

    const res = await request(app).post(URL).send({ nombre: "Ana", apellido: "Pérez" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_INVALID");
    expect(m.txParticipanteUpdateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("dos aceptaciones paralelas: una 200 y otra 410", async () => {
    m.txInvitacionUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const [r1, r2] = await Promise.all([
      request(app).post(URL).send({ nombre: "Ana", apellido: "Pérez" }),
      request(app).post(URL).send({ nombre: "Ana", apellido: "Pérez" }),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([200, 410]);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
