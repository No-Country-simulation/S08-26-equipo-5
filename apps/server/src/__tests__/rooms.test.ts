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
  },
}));

// ─── Mock Prisma ──────────────────────────────────────────
const { mockSalaCreate, mockSalaFindUnique } = vi.hoisted(() => ({
  mockSalaCreate: vi.fn(),
  mockSalaFindUnique: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: {
      create: mockSalaCreate,
      findUnique: mockSalaFindUnique,
    },
  })),
}));

// ─── Mock stream.service ──────────────────────────────────
const { mockCreateRoom, mockGenerateToken } = vi.hoisted(() => ({
  mockCreateRoom: vi.fn(),
  mockGenerateToken: vi.fn(),
}));

vi.mock("../services/stream.service.js", () => ({
  createRoom: (...args: unknown[]) => mockCreateRoom(...args),
  generateToken: (...args: unknown[]) => mockGenerateToken(...args),
  resetStreamClient: vi.fn(),
}));

// ─── Imports después de los mocks ──────────────────────────
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

const app = createApp();

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

  // ─── POST /api/rooms ────────────────────────────────────
  describe("POST /api/rooms", () => {
    const mockCid = "default:abc-123";
    const mockSala = {
      id: "sala-uuid-123",
      nombre: "Reunión Q4",
      streamRoomId: mockCid,
    };

    beforeEach(() => {
      mockCreateRoom.mockResolvedValue({ streamRoomId: mockCid });
      mockSalaCreate.mockResolvedValue(mockSala);
    });

    it("debería crear sala exitosamente (201)", async () => {
      const res = await request(app)
        .post("/api/rooms")
        .send({ name: "Reunión Q4" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        salaId: "sala-uuid-123",
        streamRoomId: mockCid,
        name: "Reunión Q4",
      });
      expect(mockCreateRoom).toHaveBeenCalledWith("Reunión Q4", undefined);
      expect(mockSalaCreate).toHaveBeenCalledWith({
        data: {
          nombre: "Reunión Q4",
          codigo: "abc-123",
          fechaInicio: expect.any(Date),
          estado: "PROGRAMADA",
          streamRoomId: mockCid,
        },
      });
    });

    it("debería retornar 400 si name está vacío", async () => {
      const res = await request(app)
        .post("/api/rooms")
        .send({ name: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("name");
      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockSalaCreate).not.toHaveBeenCalled();
    });

    it("debería retornar 400 si name excede 100 caracteres", async () => {
      const res = await request(app)
        .post("/api/rooms")
        .send({ name: "A".repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("100");
      expect(mockCreateRoom).not.toHaveBeenCalled();
      expect(mockSalaCreate).not.toHaveBeenCalled();
    });

    it("debería retornar 500 si GetStream falla", async () => {
      mockCreateRoom.mockRejectedValue(new Error("GetStream createCall failed: Rate limit exceeded"));

      const res = await request(app)
        .post("/api/rooms")
        .send({ name: "Sala Test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
      expect(mockSalaCreate).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/rooms/:id/token ──────────────────────────
  describe("POST /api/rooms/:id/token", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock";
    const mockSala = {
      id: "sala-uuid-123",
      nombre: "Reunión Q4",
      streamRoomId: "default:abc-123",
    };

    beforeEach(() => {
      mockGenerateToken.mockReturnValue(mockToken);
    });

    it("debería generar token exitosamente (200)", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateToken).toHaveBeenCalledWith("user-789", "HOST", "default:abc-123");
    });

    it("debería generar token para PARTICIPANTE (200)", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-456", role: "PARTICIPANTE" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateToken).toHaveBeenCalledWith("user-456", "PARTICIPANTE", "default:abc-123");
    });

    it("debería retornar 404 si sala no existe", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/rooms/999/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Sala no encontrada");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("debería retornar 400 si userId está vacío", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "", role: "HOST" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("userId");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("debería retornar 400 si role es inválido", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "INVALID" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("role");
      expect(res.body.error).toContain("HOST");
      expect(res.body.error).toContain("PARTICIPANTE");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("debería retornar 409 si streamRoomId es null", async () => {
      mockSalaFindUnique.mockResolvedValue({
        ...mockSala,
        streamRoomId: null,
      });

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("no sincronizada");
      expect(mockGenerateToken).not.toHaveBeenCalled();
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
