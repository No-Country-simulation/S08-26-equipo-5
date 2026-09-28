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
    // Se lee por request para poder alternar la firma en cada test
    get webhookSignatureRequired(): boolean {
      return process.env.WEBHOOK_SIGNATURE_REQUIRED === "true";
    },
  },
}));

// ─── Mock Prisma (controllers instancian PrismaClient) ─────
const { mockSalaFindFirst, mockSalaUpdate } = vi.hoisted(() => ({
  mockSalaFindFirst: vi.fn(),
  mockSalaUpdate: vi.fn(),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    sala: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: mockSalaFindFirst,
      update: mockSalaUpdate,
    },
    usuario: { findUnique: vi.fn() },
    participante: { create: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  })),
  EstadoParticipante: {
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

// ─── Mock prisma singleton (lo usa webhook.service) ─────────
vi.mock("../config/prisma.js", () => ({
  prisma: {
    sala: {
      findFirst: mockSalaFindFirst,
      update: mockSalaUpdate,
    },
  },
}));

// ─── Mock stream.service (evita cargar el SDK GetStream) ────
vi.mock("../services/stream.service.js", () => ({
  createRoom: vi.fn(),
  generateToken: vi.fn(),
  resetStreamClient: vi.fn(),
}));

// ─── Imports después de los mocks ──────────────────────────
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { createApp } from "../app.js";

const app = createApp();

const API_SECRET = "test-webhook-secret";
process.env.GETSTREAM_API_SECRET = API_SECRET;

function sign(rawBody: string, secret = API_SECRET): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function postWebhook(rawBody: string, headers: Record<string, string> = {}) {
  return request(app)
    .post("/webhooks/getstream")
    .set("Content-Type", "application/json")
    .set(headers)
    .send(rawBody);
}

const callEnded = JSON.stringify({
  type: "call.ended",
  call: { cid: "default:abc-123" },
});

describe("S3-08 — Webhooks GetStream (HMAC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SIGNATURE_REQUIRED = "true";
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SIGNATURE_REQUIRED;
  });

  it("200 — firma HMAC válida → { received: true }", async () => {
    const body = JSON.stringify({
      type: "call.started",
      call: { cid: "default:abc-123" },
    });

    const res = await postWebhook(body, { "X-Signature": sign(body) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockSalaFindFirst).not.toHaveBeenCalled();
    expect(mockSalaUpdate).not.toHaveBeenCalled();
  });

  it("401 — firma inválida → servicio/prisma NO ejecutado", async () => {
    const res = await postWebhook(callEnded, {
      "X-Signature": "f".repeat(64),
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockSalaFindFirst).not.toHaveBeenCalled();
    expect(mockSalaUpdate).not.toHaveBeenCalled();
  });

  it("401 — firma con longitud distinta no lanza (timingSafeEqual guard)", async () => {
    const res = await postWebhook(callEnded, { "X-Signature": "abc" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockSalaFindFirst).not.toHaveBeenCalled();
  });

  it("401 — firma ausente con WEBHOOK_SIGNATURE_REQUIRED=true", async () => {
    const res = await postWebhook(callEnded);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(mockSalaFindFirst).not.toHaveBeenCalled();
    expect(mockSalaUpdate).not.toHaveBeenCalled();
  });

  it("400 — JSON malformado (con firma válida sobre el body crudo)", async () => {
    const raw = '{"type": "call.ended"';

    const res = await postWebhook(raw, { "X-Signature": sign(raw) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
    expect(mockSalaUpdate).not.toHaveBeenCalled();
  });

  it("200 — call.ended con firma válida → sala.update FINALIZADA", async () => {
    mockSalaFindFirst.mockResolvedValue({ id: "sala-1", estado: "ACTIVA" });

    const res = await postWebhook(callEnded, { "X-Signature": sign(callEnded) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockSalaFindFirst).toHaveBeenCalledWith({
      where: { streamRoomId: "default:abc-123" },
    });
    expect(mockSalaUpdate).toHaveBeenCalledWith({
      where: { id: "sala-1" },
      data: { estado: "FINALIZADA", fechaFin: expect.any(Date) },
    });
  });

  // call.session_ended dispara también cuando el host queda momentáneamente
  // solo en la call (llega antes que los invitados, o se le corta la
  // conexión un instante). Si finalizáramos la sala en ese evento, los
  // invitados que llegan después quedarían afuera sin poder reingresar.
  // Por eso NO finaliza la sala: solo call.ended (el host la termina de
  // verdad) lo hace.
  it("200 — call.session_ended con firma válida → NO finaliza la sala", async () => {
    const sessionEnded = JSON.stringify({
      type: "call.session_ended",
      call: { cid: "default:abc-123" },
    });

    const res = await postWebhook(sessionEnded, {
      "X-Signature": sign(sessionEnded),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockSalaFindFirst).not.toHaveBeenCalled();
    expect(mockSalaUpdate).not.toHaveBeenCalled();
  });

  it("200 — sin firma cuando la verificación está deshabilitada (dev)", async () => {
    process.env.WEBHOOK_SIGNATURE_REQUIRED = "false";
    mockSalaFindFirst.mockResolvedValue({ id: "sala-1", estado: "ACTIVA" });

    const res = await postWebhook(callEnded);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockSalaUpdate).toHaveBeenCalled();
  });
});
