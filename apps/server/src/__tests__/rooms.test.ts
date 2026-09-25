import { vi } from "vitest";

// ─── Mock env module BEFORE any other imports ───────────────
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
    webhookSignatureRequired: false,
  },
}));

// ─── Mock Prisma ──────────────────────────────────────────
const {
  mockSalaCreate,
  mockSalaFindUnique,
  mockParticipanteFindUnique,
  mockParticipanteFindFirst,
} = vi.hoisted(() => ({
  mockSalaCreate: vi.fn(),
  mockSalaFindUnique: vi.fn(),
  mockParticipanteFindUnique: vi.fn(),
  mockParticipanteFindFirst: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: {
      create: mockSalaCreate,
      findUnique: mockSalaFindUnique,
    },
    participante: {
      findUnique: mockParticipanteFindUnique,
      findFirst: mockParticipanteFindFirst,
    },
  })),
  EstadoParticipante: {
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

// ─── Mock stream.service ──────────────────────────────────
const { mockCreateRoom, mockIssueCallAccess } = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockIssueCallAccess: vi.fn(),
}));

vi.mock("../services/stream.service.js", () => ({
  createRoom: (...args: unknown[]) => mockCreateRoom(...args),
  issueCallAccess: (...args: unknown[]) => mockIssueCallAccess(...args),
  resetStreamClient: vi.fn(),
  DEFAULT_CALL_TYPE: "default",
}));

// ─── Imports después de los mocks ──────────────────────────
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";

const app = createApp();
const JWT_SECRET = "test-jwt-secret";

function createToken(userId: string, email = "user@test.com"): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: "15m" });
}

describe("Rooms API — Integración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── GET /api/v1/health ─────────────────────────────────
  describe("GET /api/v1/health", () => {
    it("debería retornar 200 con status success", async () => {
      const res = await request(app).get("/api/v1/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ─── POST /api/v1/rooms/:id/token (alias legacy) ───────
  // Delega en la misma lógica que POST /salas/:salaId/stream-token vía
  // authParticipante: el rol/usuario salen siempre de la DB, el body
  // (userId/role) se ignora por completo. Ver rooms.controller.ts.
  describe("POST /api/v1/rooms/:id/token (alias legacy de stream-token)", () => {
    // NOTA: un intento previo de este cambio eliminaba este endpoint
    // (esperaba 404). Se decidió mantenerlo como alias porque apps/web
    // todavía le pega a /rooms/:id/token; ver JOIN-FLOW.md.
    const salaId = "sala-uuid-123";
    const mockSala = {
      id: salaId,
      codigo: "ABCD1234",
      nombre: "Reunión Q4",
      estado: "ACTIVA",
      streamRoomId: "default:abc-123",
      streamCallType: "default",
      streamCallId: "abc-123",
    };
    const userId = "user-uuid-123";
    const authHeader = () => ({ Authorization: `Bearer ${createToken(userId)}` });

    beforeEach(() => {
      mockIssueCallAccess.mockResolvedValue({
        token: "stream-token-abc",
        expiresAt: new Date("2026-09-24T18:00:00.000Z"),
        callCid: "default:abc-123",
      });
    });

    it("401 — sin Authorization y el servicio NO es llamado", async () => {
      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("401 — token expirado y el servicio NO es llamado", async () => {
      const expired = jwt.sign(
        { sub: userId, email: "user@test.com" },
        JWT_SECRET,
        { expiresIn: -3600 }
      );

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set("Authorization", `Bearer ${expired}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("401 — token firmado con secreto incorrecto y el servicio NO es llamado", async () => {
      const wrongSecret = jwt.sign(
        { sub: userId, email: "user@test.com" },
        "otro-secreto",
        { expiresIn: "15m" }
      );

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set("Authorization", `Bearer ${wrongSecret}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("200 — JWT válido + participante HOST genera token como HOST (body ignorado)", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindFirst.mockResolvedValue({
        id: "part-1",
        salaId,
        usuarioId: userId,
        nombre: "Host",
        apellido: "Uno",
        email: "host@test.com",
        rol: "HOST",
        estado: "APROBADO",
        sala: mockSala,
      });

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set(authHeader())
        .send({ userId: "impersonado", role: "PARTICIPANTE" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe("stream-token-abc");
      // El rol enviado por body ("PARTICIPANTE") se ignora: sale de la DB.
      expect(mockIssueCallAccess).toHaveBeenCalledWith(
        expect.objectContaining({ role: "HOST", userId: "part-1" })
      );
    });

    it("403 — JWT válido pero el usuario NO es participante de la sala", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindFirst.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set(authHeader())
        .send({ userId, role: "HOST" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("NOT_A_PARTICIPANT");
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("403 — participante PENDIENTE no obtiene token y el servicio NO es llamado", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindFirst.mockResolvedValue({
        id: "part-3",
        salaId,
        usuarioId: userId,
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@test.com",
        rol: "PARTICIPANTE",
        estado: "PENDIENTE",
        sala: mockSala,
      });

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set(authHeader())
        .send({ userId, role: "HOST" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("JOIN_NOT_APPROVED");
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("401 — JWT válido sin claim sub y el servicio NO es llamado", async () => {
      const tokenSinSub = jwt.sign({ email: "user@test.com" }, JWT_SECRET, {
        expiresIn: "15m",
      });

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set("Authorization", `Bearer ${tokenSinSub}`)
        .send({ userId, role: "HOST" });

      expect(res.status).toBe(401);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("403 — sala inexistente (participante no encontrado para esa sala)", async () => {
      mockParticipanteFindFirst.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/rooms/no-existe/token")
        .set({ Authorization: `Bearer ${createToken(userId)}` })
        .send({ userId, role: "HOST" });

      expect(res.status).toBe(403);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });

    it("409 — streamRoomId es null (sala no sincronizada con GetStream)", async () => {
      const salaSinStream = { ...mockSala, streamCallType: null, streamCallId: null };
      mockSalaFindUnique.mockResolvedValue(salaSinStream);
      mockParticipanteFindFirst.mockResolvedValue({
        id: "part-1",
        salaId,
        usuarioId: userId,
        nombre: "Host",
        apellido: "Uno",
        email: "host@test.com",
        rol: "HOST",
        estado: "APROBADO",
        sala: salaSinStream,
      });

      const res = await request(app)
        .post(`/api/v1/rooms/${salaId}/token`)
        .set(authHeader())
        .send({ userId, role: "HOST" });

      expect(res.status).toBe(409);
      expect(mockIssueCallAccess).not.toHaveBeenCalled();
    });
  });

  // ─── 404 handler ────────────────────────────────────────
  describe("Ruta no existente", () => {
    it("debería retornar 404 para rutas no registradas", async () => {
      const res = await request(app).get("/api/no-existe");

      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({
        code: "NOT_FOUND",
        message: "Recurso no encontrado",
      });
    });
  });
});
