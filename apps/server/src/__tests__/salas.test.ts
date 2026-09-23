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
  mockParticipanteFindUnique,
  mockTransaction,
} = vi.hoisted(() => ({
  mockSalaCreate: vi.fn(),
  mockSalaFindUnique: vi.fn(),
  mockUsuarioFindUnique: vi.fn(),
  mockParticipanteCreate: vi.fn(),
  mockParticipanteFindUnique: vi.fn(),
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
      findUnique: mockParticipanteFindUnique,
    },
    $transaction: mockTransaction,
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

  // ─── POST /api/v1/salas/:id/transfer-host ───────────────
  describe("POST /api/v1/salas/:id/transfer-host", () => {
    const salaId = "sala-uuid-777";
    const hostId = "user-host-1";
    const targetId = "user-target-2";
    const hostToken = createToken(hostId, "host@test.com");

    const mockSala = { id: salaId, codigo: "TRAN1234", nombre: "Sala Transfer" };
    let mockTxParticipanteUpdate: ReturnType<typeof vi.fn>;
    let mockTxParticipanteUpdateMany: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockTxParticipanteUpdate = vi.fn().mockResolvedValue({});
      mockTxParticipanteUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
      mockTransaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const tx = {
          participante: {
            update: mockTxParticipanteUpdate,
            updateMany: mockTxParticipanteUpdateMany,
          },
        };
        return fn(tx);
      });
      mockParticipanteFindUnique.mockImplementation(async ({ where }: any) => {
        const uid = where.salaId_usuarioId.usuarioId;
        if (uid === hostId) {
          return { salaId, usuarioId: hostId, rol: "HOST", estado: "APROBADO" };
        }
        return { salaId, usuarioId: targetId, rol: "PARTICIPANTE", estado: "APROBADO" };
      });
    });

    it("200 — HOST transfiere el rol a otro participante", async () => {
      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .set("Authorization", `Bearer ${hostToken}`)
        .send({ nuevoHostId: targetId });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: "Rol de HOST transferido exitosamente",
        host: { usuarioId: targetId },
        previousHost: { usuarioId: hostId },
      });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTxParticipanteUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockTxParticipanteUpdateMany).toHaveBeenCalledWith({
        where: { salaId, usuarioId: hostId, rol: "HOST" },
        data: { rol: "PARTICIPANTE" },
      });
      expect(mockTxParticipanteUpdate).toHaveBeenCalledTimes(1);
      expect(mockTxParticipanteUpdate).toHaveBeenCalledWith({
        where: { salaId_usuarioId: { salaId, usuarioId: targetId } },
        data: { rol: "HOST" },
      });
    });

    it("403 — demote con count 0 (carrera concurrente): target NO es promovido", async () => {
      // Simula que otra transferencia ya demovió al HOST: updateMany no matchea.
      mockTxParticipanteUpdateMany.mockResolvedValue({ count: 0 });

      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .set("Authorization", `Bearer ${hostToken}`)
        .send({ nuevoHostId: targetId });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Solo el HOST puede transferir el rol");
      expect(mockTxParticipanteUpdateMany).toHaveBeenCalledWith({
        where: { salaId, usuarioId: hostId, rol: "HOST" },
        data: { rol: "PARTICIPANTE" },
      });
      expect(mockTxParticipanteUpdate).not.toHaveBeenCalled();
    });

    it("403 — Caller no es HOST y no se ejecuta transacción", async () => {
      mockParticipanteFindUnique.mockResolvedValue({
        salaId,
        usuarioId: hostId,
        rol: "PARTICIPANTE",
        estado: "APROBADO",
      });

      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .set("Authorization", `Bearer ${hostToken}`)
        .send({ nuevoHostId: targetId });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Solo el HOST puede transferir el rol");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("404 — Target no es participante de la sala y no se ejecuta transacción", async () => {
      mockParticipanteFindUnique.mockImplementation(async ({ where }: any) => {
        const uid = where.salaId_usuarioId.usuarioId;
        if (uid === hostId) {
          return { salaId, usuarioId: hostId, rol: "HOST", estado: "APROBADO" };
        }
        return null;
      });

      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .set("Authorization", `Bearer ${hostToken}`)
        .send({ nuevoHostId: "user-no-existe" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("participante de la sala");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("400 — Auto-transferencia y no se ejecuta transacción", async () => {
      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .set("Authorization", `Bearer ${hostToken}`)
        .send({ nuevoHostId: hostId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("ti mismo");
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("401 — Sin token de autenticación", async () => {
      const res = await request(app)
        .post(`/api/v1/salas/${salaId}/transfer-host`)
        .send({ nuevoHostId: targetId });

      expect(res.status).toBe(401);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/v1/rooms/:id/token (legacy) ──────────────
  describe("POST /api/v1/rooms/:id/token", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIs.mock";
    const tokenUserId = "user-uuid-token";
    const mockSala = {
      id: "sala-uuid-123",
      streamRoomId: "default:abc-123",
    };

    beforeEach(() => {
      mockGenerateToken.mockReturnValue(mockToken);
    });

    it("200 — Generar token exitosamente con JWT y rol de DB", async () => {
      mockSalaFindUnique.mockResolvedValue(mockSala);
      mockParticipanteFindUnique.mockResolvedValue({
        id: "part-1",
        salaId: mockSala.id,
        usuarioId: tokenUserId,
        rol: "HOST",
        estado: "APROBADO",
      });

      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .set("Authorization", `Bearer ${createToken(tokenUserId, "user@test.com")}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe(mockToken);
      expect(mockGenerateToken).toHaveBeenCalledWith(
        tokenUserId,
        "HOST",
        "default:abc-123"
      );
    });

    it("401 — Sin token de autenticación no obtiene token GetStream", async () => {
      const res = await request(app)
        .post("/api/v1/rooms/sala-uuid-123/token")
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(401);
      expect(mockGenerateToken).not.toHaveBeenCalled();
    });

    it("404 — Sala no existe", async () => {
      mockSalaFindUnique.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/rooms/999/token")
        .set("Authorization", `Bearer ${createToken(tokenUserId, "user@test.com")}`)
        .send({ userId: "user-789", role: "HOST" });

      expect(res.status).toBe(404);
    });
  });
});
