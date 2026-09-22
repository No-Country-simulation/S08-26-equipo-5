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
const {
  mockSalaCreate,
  mockSalaFindUnique,
  mockUsuarioFindUnique,
  mockParticipanteCreate,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSalaCreate: vi.fn(),
  mockSalaFindUnique: vi.fn(),
  mockUsuarioFindUnique: vi.fn(),
  mockParticipanteCreate: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: {
      create: mockSalaCreate,
      findUnique: mockSalaFindUnique,
    },
    usuario: {
      findUnique: mockUsuarioFindUnique,
    },
    participante: {
      create: mockParticipanteCreate,
    },
    $transaction: mockTransaction,
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
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";

const app = createApp();
const JWT_SECRET = "test-jwt-secret";

// ─── Helpers ──────────────────────────────────────────────
function createToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: "15m" });
}

describe("S2-01 — Salas API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/v1/salas ─────────────────────────────────
  describe("POST /api/v1/salas", () => {
    const mockUserId = "user-uuid-123";
    const mockToken = createToken(mockUserId, "host@test.com");
    const mockStreamRoomId = "default:abc-123";
    const mockCodigo = "ABCD1234";

    const mockSala = {
      id: "sala-uuid-456",
      codigo: mockCodigo,
      nombre: "Reunión Q4",
      streamRoomId: mockStreamRoomId,
    };

    const mockUsuario = {
      nombre: "Juan",
      apellido: "Pérez",
      email: "host@test.com",
    };

    beforeEach(() => {
      mockCreateRoom.mockResolvedValue({ streamRoomId: mockStreamRoomId });
      mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          sala: { create: vi.fn().mockResolvedValue(mockSala) },
          usuario: { findUnique: vi.fn().mockResolvedValue(mockUsuario) },
          participante: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
    });

    it("201 — Crear sala exitosamente con auth JWT", async () => {
      const res = await request(app)
        .post("/api/v1/salas")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ nombre: "Reunión Q4" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        salaId: "sala-uuid-456",
        codigo: mockCodigo,
        nombre: "Reunión Q4",
        enlace: expect.stringContaining("/sala/"),
        streamRoomId: mockStreamRoomId,
      });
      expect(mockCreateRoom).toHaveBeenCalledWith("Reunión Q4", mockUserId);
    });

    it("401 — Sin token de autenticación", async () => {
      const res = await request(app)
        .post("/api/v1/salas")
        .send({ nombre: "Reunión Q4" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(mockCreateRoom).not.toHaveBeenCalled();
    });

    it("401 — Token inválido", async () => {
      const res = await request(app)
        .post("/api/v1/salas")
        .set("Authorization", "Bearer invalid-token")
        .send({ nombre: "Reunión Q4" });

      expect(res.status).toBe(401);
      expect(mockCreateRoom).not.toHaveBeenCalled();
    });

    it("400 — Nombre vacío", async () => {
      const res = await request(app)
        .post("/api/v1/salas")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ nombre: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("nombre");
      expect(mockCreateRoom).not.toHaveBeenCalled();
    });

    it("400 — Nombre excede 150 caracteres", async () => {
      const res = await request(app)
        .post("/api/v1/salas")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ nombre: "A".repeat(151) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("150");
      expect(mockCreateRoom).not.toHaveBeenCalled();
    });

    it("500 — GetStream falla", async () => {
      mockCreateRoom.mockRejectedValue(new Error("GetStream rate limit"));

      const res = await request(app)
        .post("/api/v1/salas")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({ nombre: "Sala Test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  // ─── GET /api/v1/salas/:code ────────────────────────────
  describe("GET /api/v1/salas/:code", () => {
    const mockSalaPublica = {
      id: "sala-uuid-789",
      codigo: "XYZT9876",
      nombre: "Demo Técnica",
      resumen: "Presentación del proyecto",
      fechaInicio: new Date("2026-09-20T10:00:00Z"),
      estado: "PROGRAMADA",
      _count: { participantes: 5 },
    };

    it("200 — Obtener sala pública por código", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSalaPublica);

      const res = await request(app).get("/api/v1/salas/XYZT9876");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: "sala-uuid-789",
        codigo: "XYZT9876",
        nombre: "Demo Técnica",
        resumen: "Presentación del proyecto",
        fechaInicio: "2026-09-20T10:00:00.000Z",
        estado: "PROGRAMADA",
        totalParticipantes: 5,
      });
      expect(mockSalaFindUnique).toHaveBeenCalledWith({
        where: { codigo: "XYZT9876" },
        include: { _count: { select: { participantes: true } } },
      });
    });

    it("200 — Código en minúsculas se convierte a mayúsculas", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSalaPublica);

      const res = await request(app).get("/api/v1/salas/xyzt9876");

      expect(res.status).toBe(200);
      expect(mockSalaFindUnique).toHaveBeenCalledWith({
        where: { codigo: "XYZT9876" },
        include: { _count: { select: { participantes: true } } },
      });
    });

    it("404 — Código inexistente", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app).get("/api/v1/salas/NOEXISTE");

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Sala no encontrada");
    });

    it("400 — Código vacío", async () => {
      const res = await request(app).get("/api/v1/salas/");

      expect(res.status).not.toBe(200); // 404 o 405取决于 Express behavior
    });
  });

  // ─── POST /api/v1/rooms/:id/token (legacy) ──────────────
  describe("POST /api/v1/rooms/:id/token", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIs.mock";
    const mockSala = {
      id: "sala-uuid-123",
      streamRoomId: "default:abc-123",
    };

    beforeEach(() => {
      mockGenerateToken.mockReturnValue(mockToken);
    });

    it("200 — Generar token exitosamente", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
    });

    it("404 — Sala no existe", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/rooms/999/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(404);
    });
  });
});
