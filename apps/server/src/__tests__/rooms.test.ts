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
const { mockSalaCreate, mockSalaFindUnique, mockParticipanteFindUnique } =
  vi.hoisted(() => ({
    mockSalaCreate: vi.fn(),
    mockSalaFindUnique: vi.fn(),
    mockParticipanteFindUnique: vi.fn(),
  }));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: {
      create: mockSalaCreate,
      findUnique: mockSalaFindUnique,
    },
    participante: {
      findUnique: mockParticipanteFindUnique,
    },
  })),
  EstadoParticipante: {
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
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

function createToken(userId: string, email = "user@test.com"): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: "15m" });
}

describe("Rooms API — Integración (legacy)", () => {
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

  // ─── POST /api/v1/rooms/:id/token ──────────────────────
  describe("POST /api/v1/rooms/:id/token", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock";
    const mockSala = {
      id: "sala-uuid-123",
      nombre: "Reunión Q4",
      streamRoomId: "default:abc-123",
    };
    const userId = "user-uuid-123";
    const authHeader = () => ({ Authorization: `Bearer ${createToken(userId)}` });

    beforeEach(() => {
      mockGenerateToken.mockReturnValue(mockToken);
    });

    it("401 — sin Authorization y el servicio NO es llamado", async () => {
      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(mockGenerateToken).not.toHaveBeenCalled();
      expect(mockSalaFindUnique).not.toHaveBeenCalled();
    });

    it("401 — token expirado y el servicio NO es llamado", async () => {
      const expired = jwt.sign(
        { sub: userId, email: "user@test.com" },
        JWT_SECRET,
        { expiresIn: -3600 }
      );

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set("Authorization", `Bearer ${expired}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      // Sensible al middleware: este message solo lo emite verifyToken.
      // Sin middleware, el fallback del controller responde "Usuario no autenticado".
      expect(res.body.error.message).toBe("Token ausente, inválido o expirado");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("401 — token firmado con secreto incorrecto y el servicio NO es llamado", async () => {
      const wrongSecret = jwt.sign(
        { sub: userId, email: "user@test.com" },
        "otro-secreto",
        { expiresIn: "15m" }
      );

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set("Authorization", `Bearer ${wrongSecret}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("200 — JWT válido + participante HOST genera token como HOST", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindUnique.mockResolvedValue({
        id: "part-1",
        salaId: mockSala.id,
        usuarioId: userId,
        rol: "HOST",
        estado: "APROBADO",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set(authHeader())
        .send({ userId: "impersonado", role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockParticipanteFindUnique).toHaveBeenCalledWith({
        where: { salaId_usuarioId: { salaId: "sala-uuid-123", usuarioId: userId } },
      });
      expect(mockGenerateToken).toHaveBeenCalledWith(
        userId,
        "HOST",
        "default:abc-123"
      );
    });

    it("200 — body role HOST ignorado: PARTICIPANTE recibe token PARTICIPANTE", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindUnique.mockResolvedValue({
        id: "part-2",
        salaId: mockSala.id,
        usuarioId: userId,
        rol: "PARTICIPANTE",
        estado: "APROBADO",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set(authHeader())
        .send({ userId: userId, role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateToken).toHaveBeenCalledWith(
        userId,
        "PARTICIPANTE",
        "default:abc-123"
      );
    });

    it("403 — JWT válido pero el usuario NO es participante de la sala", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set(authHeader())
        .send({ userId: userId, role: "HOST" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain(
        "Solo los participantes aprobados pueden obtener token"
      );
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("403 — participante PENDIENTE no obtiene token y el servicio NO es llamado", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindUnique.mockResolvedValue({
        id: "part-3",
        salaId: mockSala.id,
        usuarioId: userId,
        rol: "PARTICIPANTE",
        estado: "PENDIENTE",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set(authHeader())
        .send({ userId: userId, role: "HOST" });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain(
        "Solo los participantes aprobados pueden obtener token"
      );
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("401 — JWT válido sin claim sub y el servicio NO es llamado", async () => {
      const tokenSinSub = jwt.sign({ email: "user@test.com" }, JWT_SECRET, {
        expiresIn: "15m",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set("Authorization", `Bearer ${tokenSinSub}`)
        .send({ userId: userId, role: "HOST" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(mockGenerateToken).not.toHaveBeenCalled();
      expect(mockSalaFindUnique).not.toHaveBeenCalled();
    });

    it("debería retornar 404 si sala no existe", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/rooms/999/token")
        .set(authHeader())
        .send({ userId: userId, role: "HOST" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("Sala no encontrada");
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("debería retornar 409 si streamRoomId es null", async () => {
      mockSalaFindUnique.mockResolvedValue({
        ...mockSala,
        streamRoomId: null,
      });
      mockParticipanteFindUnique.mockResolvedValue({
        id: "part-1",
        salaId: mockSala.id,
        usuarioId: userId,
        rol: "HOST",
        estado: "APROBADO",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set(authHeader())
        .send({ userId: userId, role: "HOST" });

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
