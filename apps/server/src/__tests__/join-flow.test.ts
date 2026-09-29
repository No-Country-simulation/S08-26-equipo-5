import { vi } from "vitest";

// ─── Mock env ANTES de cualquier otro import ────────────────
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
    frontendUrl: "http://localhost:3000",
    getstreamApiKey: "test-stream-key",
    getstreamApiSecret: "test-stream-secret",
    streamTokenTtlSeconds: 3600,
    participantTokenTtlSeconds: 7200,
    webhookVerifySignature: false,
  },
}));

// ─── Mock Prisma ────────────────────────────────────────────
const {
  mockSalaFindUnique,
  mockParticipanteFindUnique,
  mockParticipanteFindFirst,
  mockParticipanteFindMany,
  mockParticipanteCreate,
  mockParticipanteUpdate,
  mockUsuarioFindUnique,
} = vi.hoisted(() => ({
  mockSalaFindUnique: vi.fn(),
  mockParticipanteFindUnique: vi.fn(),
  mockParticipanteFindFirst: vi.fn(),
  mockParticipanteFindMany: vi.fn(),
  mockParticipanteCreate: vi.fn(),
  mockParticipanteUpdate: vi.fn(),
  mockUsuarioFindUnique: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: { findUnique: mockSalaFindUnique },
    participante: {
      findUnique: mockParticipanteFindUnique,
      findFirst: mockParticipanteFindFirst,
      findMany: mockParticipanteFindMany,
      create: mockParticipanteCreate,
      update: mockParticipanteUpdate,
    },
    usuario: { findUnique: mockUsuarioFindUnique },
  })),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

// ─── Mock del SDK de GetStream ──────────────────────────────
const { mockIssueCallAccess, mockCreateRoom } = vi.hoisted(() => ({
  mockIssueCallAccess: vi.fn(),
  mockCreateRoom: vi.fn(),
}));

vi.mock("../services/stream.service.js", () => ({
  createRoom: (...a: unknown[]) => mockCreateRoom(...a),
  issueCallAccess: (...a: unknown[]) => mockIssueCallAccess(...a),
  resetStreamClient: vi.fn(),
  DEFAULT_CALL_TYPE: "default",
}));

// ─── Imports después de los mocks ───────────────────────────
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { signParticipantToken } from "../utils/participantToken.js";

const app = createApp();

const SALA_ID = "11111111-1111-1111-1111-111111111111";
const OTRA_SALA_ID = "22222222-2222-2222-2222-222222222222";
const PARTICIPANTE_ID = "33333333-3333-3333-3333-333333333333";
const HOST_USER_ID = "44444444-4444-4444-4444-444444444444";
const CALL_ID = "abc-123";

const salaActiva = {
  id: SALA_ID,
  codigo: "ABCD1234",
  nombre: "Reunión Q4",
  estado: "ACTIVA",
  streamRoomId: `default:${CALL_ID}`,
  streamCallType: "default",
  streamCallId: CALL_ID,
};

function participante(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTICIPANTE_ID,
    usuarioId: null,
    salaId: SALA_ID,
    nombre: "Ana",
    apellido: "Pérez",
    email: "ana@test.com",
    rol: "PARTICIPANTE",
    estado: "APROBADO",
    fechaIngreso: new Date(),
    ...overrides,
  };
}

function guestToken(overrides: Partial<{ participanteId: string; salaId: string }> = {}) {
  return signParticipantToken({
    participanteId: overrides.participanteId ?? PARTICIPANTE_ID,
    salaId: overrides.salaId ?? SALA_ID,
    rol: "PARTICIPANTE",
  });
}

function userToken(userId = HOST_USER_ID) {
  return jwt.sign({ sub: userId, email: "host@test.com" }, "test-jwt-secret", {
    expiresIn: "15m",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIssueCallAccess.mockResolvedValue({
    token: "stream-token-abc",
    expiresAt: new Date("2026-09-24T18:00:00.000Z"),
    callCid: `default:${CALL_ID}`,
  });
  mockParticipanteFindMany.mockResolvedValue([]);
});

// ════════════════════════════════════════════════════════════
describe("POST /api/v1/salas/:code/join", () => {
  it("200 — crea el participante como PENDIENTE", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindFirst.mockResolvedValue(null);
    mockParticipanteCreate.mockResolvedValue(
      participante({ estado: "PENDIENTE", fechaIngreso: null }),
    );

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "Ana@Test.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      participanteId: PARTICIPANTE_ID,
      estado: "PENDIENTE",
      salaId: SALA_ID,
      accessToken: expect.any(String),
    });
    // El email se normaliza a minúsculas antes de persistir
    expect(mockParticipanteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "ana@test.com" }),
      }),
    );
    // El PENDIENTE recibe guest JWT (solo para autenticar el socket: los
    // endpoints protegidos siguen exigiendo APROBADO por su cuenta), pero NO
    // stream: sin aprobación no hay call al que unirse.
    expect(res.body.stream).toBeUndefined();
  });

  it("200 — reingreso de un aprobado reciente devuelve accessToken", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindFirst.mockResolvedValue(participante());

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "ana@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("APROBADO");
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.stream).toEqual({
      callType: "default",
      callId: CALL_ID,
      callCid: `default:${CALL_ID}`,
    });
    expect(mockParticipanteCreate).not.toHaveBeenCalled();
  });

  it("200 — una aprobación vencida vuelve a PENDIENTE con guest JWT nuevo", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindFirst.mockResolvedValue(
      participante({ fechaIngreso: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
    );
    mockParticipanteUpdate.mockResolvedValue(
      participante({ estado: "PENDIENTE", fechaIngreso: null }),
    );

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "ana@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("PENDIENTE");
    expect(res.body.accessToken).toBeTypeOf("string");
  });

  it("403 — participante rechazado", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindFirst.mockResolvedValue(
      participante({ estado: "RECHAZADO" }),
    );

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "ana@test.com" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("JOIN_REJECTED");
  });

  it("409 — la sala fue cancelada", async () => {
    mockSalaFindUnique.mockResolvedValue({ ...salaActiva, estado: "CANCELADA" });

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "ana@test.com" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROOM_CANCELLED");
  });

  it("404 — código inexistente", async () => {
    mockSalaFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/salas/NOEXISTE/join")
      .send({ nombre: "Ana", apellido: "Pérez", email: "ana@test.com" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROOM_NOT_FOUND");
  });

  it("400 — faltan campos obligatorios", async () => {
    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .send({ nombre: "Ana" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("apellido");
    expect(res.body.error.message).toContain("email");
  });

  // ── Usuario logueado: identidad autocompletada desde la cuenta ──
  const CUENTA = {
    id: HOST_USER_ID,
    nombre: "Marco",
    apellido: "Vidal",
    email: "marco@test.com",
    passwordHash: "hash",
  };

  it("200 — usuario logueado con body vacío autocompleta identidad desde la cuenta", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindUnique.mockResolvedValue(null); // findByUsuario
    mockParticipanteFindFirst.mockResolvedValue(null); // findByEmail
    mockUsuarioFindUnique.mockResolvedValue(CUENTA);
    mockParticipanteCreate.mockResolvedValue(
      participante({
        estado: "PENDIENTE",
        fechaIngreso: null,
        usuarioId: HOST_USER_ID,
        nombre: "Marco",
        apellido: "Vidal",
        email: "marco@test.com",
      }),
    );

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("PENDIENTE");
    expect(mockParticipanteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioId: HOST_USER_ID,
          nombre: "Marco",
          apellido: "Vidal",
          email: "marco@test.com",
        }),
      }),
    );
  });

  it("200 — usuario logueado que manda otro email: se usa el email de la cuenta (no se puede impersonar)", async () => {
    mockSalaFindUnique.mockResolvedValue(salaActiva);
    mockParticipanteFindUnique.mockResolvedValue(null);
    mockParticipanteFindFirst.mockResolvedValue(null);
    mockUsuarioFindUnique.mockResolvedValue(CUENTA);
    mockParticipanteCreate.mockResolvedValue(
      participante({
        estado: "PENDIENTE",
        fechaIngreso: null,
        usuarioId: HOST_USER_ID,
        nombre: "Marco",
        apellido: "Vidal",
        email: "marco@test.com",
      }),
    );

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({ nombre: "Otro", apellido: "Nombre", email: "otro@evil.com" });

    expect(res.status).toBe(200);
    expect(mockParticipanteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "marco@test.com" }),
      }),
    );
  });

  it("401 — el usuario del token no existe en la DB", async () => {
    mockUsuarioFindUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/salas/ABCD1234/join")
      .set("Authorization", `Bearer ${userToken()}`)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockSalaFindUnique).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
describe("POST /api/v1/salas/:salaId/stream-token", () => {
  it("401 — sin Authorization", async () => {
    const res = await request(app).post(`/api/v1/salas/${SALA_ID}/stream-token`);

    expect(res.status).toBe(401);
    expect(mockIssueCallAccess).not.toHaveBeenCalled();
  });

  it("200 — invitado aprobado obtiene token con rol PARTICIPANTE", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      apiKey: "test-stream-key",
      token: "stream-token-abc",
      userId: PARTICIPANTE_ID,
      rol: "PARTICIPANTE",
      callType: "default",
      callId: CALL_ID,
      callCid: `default:${CALL_ID}`,
    });
    // El rol sale de la DB, no del body
    expect(mockIssueCallAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: PARTICIPANTE_ID,
        role: "PARTICIPANTE",
        callType: "default",
        callId: CALL_ID,
      }),
    );
  });

  it("200 — el HOST autenticado resuelve al MISMO call con rol HOST", async () => {
    mockParticipanteFindFirst.mockResolvedValue({
      ...participante({ rol: "HOST", usuarioId: HOST_USER_ID }),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.rol).toBe("HOST");
    expect(res.body.callCid).toBe(`default:${CALL_ID}`);
    expect(mockIssueCallAccess).toHaveBeenCalledWith(
      expect.objectContaining({ role: "HOST" }),
    );
  });

  // Regresión: transferHost promovía a HOST sin garantizar estado APROBADO.
  // authParticipante() exige APROBADO para emitir token — un HOST recién
  // transferido (fila con rol=HOST y estado=APROBADO, como ahora garantiza
  // transferHost) tiene que poder pedir su token de video sin 403.
  it("200 — un HOST recién promovido (estado APROBADO) obtiene su token", async () => {
    mockParticipanteFindFirst.mockResolvedValue({
      ...participante({ rol: "HOST", usuarioId: HOST_USER_ID, estado: "APROBADO" }),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${userToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.rol).toBe("HOST");
  });

  it("403 — el guest JWT no puede pedir un rol distinto al de la DB", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`)
      .send({ role: "HOST", userId: "otro-usuario" });

    expect(res.status).toBe(200);
    expect(res.body.rol).toBe("PARTICIPANTE");
    expect(res.body.userId).toBe(PARTICIPANTE_ID);
  });

  it("403 — participante todavía PENDIENTE", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante({ estado: "PENDIENTE", fechaIngreso: null }),
      sala: salaActiva,
    });

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("JOIN_NOT_APPROVED");
    expect(mockIssueCallAccess).not.toHaveBeenCalled();
  });

  it("403 — guest JWT emitido para otra sala", async () => {
    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken({ salaId: OTRA_SALA_ID })}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(mockIssueCallAccess).not.toHaveBeenCalled();
  });

  it("403 — usuario que no participa de la sala", async () => {
    mockParticipanteFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${userToken("otro-user")}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NOT_A_PARTICIPANT");
  });

  it("409 — la reunión ya finalizó", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: { ...salaActiva, estado: "FINALIZADA" },
    });

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ROOM_FINISHED");
  });

  it("409 — sala sin call de GetStream", async () => {
    const salaSinCall = {
      ...salaActiva,
      streamRoomId: null,
      streamCallType: null,
      streamCallId: null,
    };
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: salaSinCall,
    });
    mockSalaFindUnique.mockResolvedValue(salaSinCall);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(409);
    expect(mockIssueCallAccess).not.toHaveBeenCalled();
  });

  it("200 — salas previas a la migración: el call se deriva del CID", async () => {
    const salaLegacy = {
      ...salaActiva,
      streamCallType: null,
      streamCallId: null,
    };
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: salaLegacy,
    });
    mockSalaFindUnique.mockResolvedValue(salaLegacy);

    const res = await request(app)
      .post(`/api/v1/salas/${SALA_ID}/stream-token`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.callId).toBe(CALL_ID);
    expect(res.body.callType).toBe("default");
  });
});

// ════════════════════════════════════════════════════════════
describe("GET /api/v1/salas/:salaId/mi-estado", () => {
  it("200 — un PENDIENTE puede consultar y no recibe datos del call", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante({ estado: "PENDIENTE", fechaIngreso: null }),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .get(`/api/v1/salas/${SALA_ID}/mi-estado`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("PENDIENTE");
    expect(res.body.stream).toBeNull();
  });

  it("200 — un aprobado recibe la referencia al call", async () => {
    mockParticipanteFindUnique.mockResolvedValue({
      ...participante(),
      sala: salaActiva,
    });
    mockSalaFindUnique.mockResolvedValue(salaActiva);

    const res = await request(app)
      .get(`/api/v1/salas/${SALA_ID}/mi-estado`)
      .set("Authorization", `Bearer ${guestToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("APROBADO");
    expect(res.body.stream.callId).toBe(CALL_ID);
  });
});
