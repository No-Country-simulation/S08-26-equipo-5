import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

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

// ─── Mock @stream-io/node-sdk ──────────────────────────────
const { mockGetOrCreate, mockGenerateCallToken } = vi.hoisted(() => ({
  mockGetOrCreate: vi.fn(),
  mockGenerateCallToken: vi.fn(),
}));

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn().mockImplementation(() => ({
    video: {
      call: vi.fn().mockReturnValue({
        getOrCreate: mockGetOrCreate,
      }),
    },
    generateCallToken: mockGenerateCallToken,
  })),
}));

// ─── Imports después de los mocks ──────────────────────────
import app from "../app.js";
import { resetStreamClient } from "../services/stream.service.js";

describe("Rooms API — Integración", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStreamClient();
    process.env = {
      ...originalEnv,
      GETSTREAM_API_KEY: "test-key",
      GETSTREAM_API_SECRET: "test-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── GET /health ────────────────────────────────────────
  describe("GET /health", () => {
    it("debería retornar 200 con status ok", async () => {
      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
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
      mockGetOrCreate.mockResolvedValue({
        call: { cid: mockCid, id: "abc-123", type: "default" },
      });
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
      expect(mockGetOrCreate).toHaveBeenCalled();
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
      expect(mockGetOrCreate).not.toHaveBeenCalled();
      expect(mockSalaCreate).not.toHaveBeenCalled();
    });

    it("debería retornar 400 si name excede 100 caracteres", async () => {
      const res = await request(app)
        .post("/api/rooms")
        .send({ name: "A".repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("100");
      expect(mockGetOrCreate).not.toHaveBeenCalled();
      expect(mockSalaCreate).not.toHaveBeenCalled();
    });

    it("debería retornar 500 si GetStream falla", async () => {
      mockGetOrCreate.mockRejectedValue(new Error("Rate limit exceeded"));

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
      mockGenerateCallToken.mockReturnValue(mockToken);
    });

    it("debería generar token exitosamente (200)", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-789",
        call_cids: ["default:abc-123"],
        role: "admin",
      });
    });

    it("debería generar token para PARTICIPANTE (200)", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "user-456", role: "PARTICIPANTE" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-456",
        call_cids: ["default:abc-123"],
        role: "user",
      });
    });

    it("debería retornar 404 si sala no existe", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/rooms/999/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Sala no encontrada");
      expect(mockGenerateCallToken).not.toHaveBeenCalled();
    });

    it("debería retornar 400 si userId está vacío", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/rooms/sala-uuid-123/token")
        .send({ userId: "", role: "HOST" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("userId");
      expect(mockGenerateCallToken).not.toHaveBeenCalled();
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
      expect(mockGenerateCallToken).not.toHaveBeenCalled();
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
      expect(mockGenerateCallToken).not.toHaveBeenCalled();
    });
  });

  // ─── 404 handler ────────────────────────────────────────
  describe("Ruta no existente", () => {
    it("debería retornar 404 para rutas no registradas", async () => {
      const res = await request(app).get("/api/no-existe");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Route not found");
    });
  });
});
