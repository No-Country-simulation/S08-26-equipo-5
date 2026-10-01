import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    port: 4000,
    nodeEnv: "test",
    corsOrigin: "*",
    jwtSecret: "test-jwt-secret",
    jwtExpiresIn: "15m",
    frontendUrl: "http://localhost:3000",
    getstreamApiKey: "test-stream-key",
    getstreamApiSecret: "test-stream-secret",
    streamTokenTtlSeconds: 3600,
    participantTokenTtlSeconds: 7200,
    webhookSignatureRequired: false,
    avatarMaxBytes: 2097152,
    rateLimitAvatarMax: 10,
  },
}));

const { mockSalaFindUnique, mockParticipanteFindMany, mockParticipanteFindFirst, mockIssueCallAccess } = vi.hoisted(
  () => ({
    mockSalaFindUnique: vi.fn(),
    mockParticipanteFindMany: vi.fn(),
    mockParticipanteFindFirst: vi.fn(),
    mockIssueCallAccess: vi.fn(),
  }),
);

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: { findUnique: mockSalaFindUnique },
    participante: { findMany: mockParticipanteFindMany, findFirst: mockParticipanteFindFirst },
  })),
  EstadoParticipante: { PENDIENTE: "PENDIENTE", APROBADO: "APROBADO", RECHAZADO: "RECHAZADO" },
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
}));

vi.mock("../services/stream.service.js", () => ({
  createRoom: vi.fn(),
  issueCallAccess: (...a: unknown[]) => mockIssueCallAccess(...a),
  resetStreamClient: vi.fn(),
  DEFAULT_CALL_TYPE: "default",
}));

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";

const app = createApp();
const token = jwt.sign({ sub: "host-1", email: "h@t.com" }, "test-jwt-secret", { expiresIn: "15m" });
const auth = { Authorization: `Bearer ${token}` };

const now = new Date("2026-09-30T10:00:00.000Z");
function p(id: string, usuario: { fotoUrl: string | null; [k: string]: unknown } | null, rol = "PARTICIPANTE") {
  return {
    id,
    salaId: "sala-1",
    usuarioId: id === "host" ? "host-1" : usuario ? `u-${id}` : null,
    nombre: id,
    apellido: "X",
    email: `${id}@t.com`,
    rol,
    estado: "APROBADO",
    fechaIngreso: now,
    createdAt: now,
    usuario,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /salas/:id/participantes — fotoUrl", () => {
  it("expone la foto de las cuentas y null para invitados o sin foto", async () => {
    mockSalaFindUnique.mockResolvedValue({ id: "sala-1", nombre: "Q4" });
    mockParticipanteFindMany.mockResolvedValue([
      p("host", { fotoUrl: "https://cdn/v1/h.jpg" }, "HOST"),
      p("ana", { fotoUrl: "https://cdn/v1/ana.jpg" }),
      p("bob", { fotoUrl: null }),
      p("guest", null),
    ]);

    const res = await request(app).get("/api/v1/salas/sala-1/participantes").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.participantes.map((x: any) => x.fotoUrl)).toEqual([
      "https://cdn/v1/h.jpg",
      "https://cdn/v1/ana.jpg",
      null,
      null,
    ]);
    // forma previa intacta
    expect(res.body.participantes[1]).toMatchObject({ id: "ana", nombre: "ana", rol: "PARTICIPANTE" });
  });

  it("un participante no host ve fotoUrl pero no los emails", async () => {
    mockSalaFindUnique.mockResolvedValue({ id: "sala-1", nombre: "Q4" });
    // el caller (host-1) figura como PARTICIPANTE en la segunda fila: no es HOST
    mockParticipanteFindMany.mockResolvedValue([
      { ...p("host", { fotoUrl: "https://cdn/v1/h.jpg" }, "HOST"), usuarioId: "otro-host" },
      { ...p("yo", { fotoUrl: "https://cdn/v1/yo.jpg" }), usuarioId: "host-1" },
    ]);

    const res = await request(app).get("/api/v1/salas/sala-1/participantes").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.participantes.map((x: any) => x.email)).toEqual([null, null]);
    expect(res.body.participantes.map((x: any) => x.fotoUrl)).toEqual([
      "https://cdn/v1/h.jpg",
      "https://cdn/v1/yo.jpg",
    ]);
  });
});

describe("GET /salas/:id/detalle — fotoUrl", () => {
  it("incluye fotoUrl por participante", async () => {
    mockSalaFindUnique.mockResolvedValue({
      id: "sala-1",
      codigo: "ABCD1234",
      nombre: "Q4",
      resumen: null,
      fechaInicio: now,
      fechaFin: null,
      estado: "ACTIVA",
      streamRoomId: null,
      streamCallType: null,
      streamCallId: null,
      participantes: [
        p("host", { id: "u-host", nombre: "H", apellido: "X", email: "h@t.com", fotoUrl: "https://cdn/v1/h.jpg" }, "HOST"),
        p("guest", null),
      ],
    });

    const res = await request(app).get("/api/v1/salas/sala-1/detalle").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.participantes.map((x: any) => x.fotoUrl)).toEqual(["https://cdn/v1/h.jpg", null]);
  });
});

describe("POST /salas/:salaId/stream-token — image", () => {
  const sala = {
    id: "sala-1",
    codigo: "ABCD1234",
    nombre: "Q4",
    estado: "ACTIVA",
    streamRoomId: "default:c1",
    streamCallType: "default",
    streamCallId: "c1",
  };

  beforeEach(() => {
    mockSalaFindUnique.mockResolvedValue(sala);
    mockIssueCallAccess.mockResolvedValue({ token: "t", expiresAt: now, callCid: "default:c1" });
  });

  it("pasa la foto del usuario registrado a GetStream", async () => {
    mockParticipanteFindFirst.mockResolvedValue({
      ...p("host", { fotoUrl: "https://cdn/v1/h.jpg" }, "HOST"),
      sala,
    });

    const res = await request(app).post("/api/v1/salas/sala-1/stream-token").set(auth);

    expect(res.status).toBe(200);
    expect(mockIssueCallAccess).toHaveBeenCalledWith(
      expect.objectContaining({ isRegistered: true, image: "https://cdn/v1/h.jpg" }),
    );
  });

  it("image queda undefined sin foto", async () => {
    mockParticipanteFindFirst.mockResolvedValue({ ...p("host", { fotoUrl: null }, "HOST"), sala });

    await request(app).post("/api/v1/salas/sala-1/stream-token").set(auth);

    const arg = mockIssueCallAccess.mock.calls[0][0] as { image?: string };
    expect(arg.image).toBeUndefined();
  });
});
