import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "test",
    jwtSecret: "test-jwt-secret",
    participantTokenTtlSeconds: 7200,
    streamTokenTtlSeconds: 3600,
    getstreamApiKey: "test-stream-key",
    getstreamApiSecret: "test-stream-secret",
    frontendUrl: "http://localhost:3000",
  },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({})),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

import { describe, it, expect, beforeEach, vi as vitest } from "vitest";
import {
  resolveParticipant,
  buildJoinApprovedPayload,
  getStreamCallRef,
  requestJoin,
  type WaitingRoomDeps,
} from "../services/waitingRoom.service.js";
import { verifyParticipantToken } from "../utils/participantToken.js";
import { AppError } from "../utils/AppError.js";

const SALA_ID = "sala-1";
const HOST_USER_ID = "host-user-1";
const CALL_ID = "call-uuid-real";

const sala = {
  id: SALA_ID,
  codigo: "ABCD1234",
  estado: "ACTIVA",
  streamRoomId: `default:${CALL_ID}`,
  streamCallType: "default",
  streamCallId: CALL_ID,
};

function makeDeps(overrides: Partial<WaitingRoomDeps["participantes"]> = {}) {
  const participantes = {
    findHost: vitest.fn().mockResolvedValue({ id: "host-participante" }),
    findById: vitest.fn(),
    findByEmail: vitest.fn().mockResolvedValue(null),
    createPendiente: vitest.fn(),
    updateEstado: vitest.fn().mockResolvedValue({}),
    findAprobadosBySala: vitest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const salas = {
    findByCodigo: vitest.fn().mockResolvedValue(sala),
    findById: vitest.fn().mockResolvedValue(sala),
  };
  return { participantes, salas } as unknown as WaitingRoomDeps & {
    participantes: typeof participantes;
    salas: typeof salas;
  };
}

const pendiente = {
  id: "participante-1",
  salaId: SALA_ID,
  estado: "PENDIENTE",
  rol: "PARTICIPANTE",
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@test.com",
  fechaIngreso: null,
  sala,
};

beforeEach(() => vi.clearAllMocks());

describe("getStreamCallRef", () => {
  it("usa las columnas dedicadas cuando existen", () => {
    expect(getStreamCallRef(sala)).toEqual({
      callType: "default",
      callId: CALL_ID,
      callCid: `default:${CALL_ID}`,
    });
  });

  it("deriva el call del CID en salas previas a la migración", () => {
    expect(
      getStreamCallRef({
        streamRoomId: "default:legacy-id",
        streamCallType: null,
        streamCallId: null,
      }),
    ).toEqual({
      callType: "default",
      callId: "legacy-id",
      callCid: "default:legacy-id",
    });
  });

  it("devuelve null si la sala nunca se sincronizó", () => {
    expect(
      getStreamCallRef({
        streamRoomId: null,
        streamCallType: null,
        streamCallId: null,
      }),
    ).toBeNull();
  });
});

describe("buildJoinApprovedPayload", () => {
  it("emite el callId REAL, no uno derivado del código de sala", () => {
    const payload = buildJoinApprovedPayload(
      { id: "participante-1", rol: "PARTICIPANTE" },
      sala,
    );

    expect(payload.stream?.callId).toBe(CALL_ID);
    expect(payload.streamCallId).toBe(CALL_ID);
    // Regresión: el bug original era `call_<codigo en minúsculas>`
    expect(payload.streamCallId).not.toBe("call_abcd1234");
  });

  it("incluye un guest JWT verificable y ligado a la sala", () => {
    const payload = buildJoinApprovedPayload(
      { id: "participante-1", rol: "PARTICIPANTE" },
      sala,
    );

    const claims = verifyParticipantToken(payload.accessToken);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("participante-1");
    expect(claims?.salaId).toBe(SALA_ID);
    expect(claims?.rol).toBe("PARTICIPANTE");
  });
});

describe("resolveParticipant", () => {
  it("aprueba y marca fechaIngreso", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendiente),
    });

    const result = await resolveParticipant(deps, {
      participanteId: "participante-1",
      hostUsuarioId: HOST_USER_ID,
      nuevoEstado: "APROBADO" as never,
    });

    expect(result.evento).toBe("join:approved");
    expect(deps.participantes.updateEstado).toHaveBeenCalledWith(
      "participante-1",
      "APROBADO",
      expect.any(Date),
    );
  });

  it("rechaza sin emitir credenciales", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendiente),
    });

    const result = await resolveParticipant(deps, {
      participanteId: "participante-1",
      hostUsuarioId: HOST_USER_ID,
      nuevoEstado: "RECHAZADO" as never,
    });

    expect(result.evento).toBe("join:rejected");
    expect(result.payload).not.toHaveProperty("accessToken");
  });

  it("solo el HOST puede resolver", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendiente),
      findHost: vitest.fn().mockResolvedValue(null),
    });

    await expect(
      resolveParticipant(deps, {
        participanteId: "participante-1",
        hostUsuarioId: "intruso",
        nuevoEstado: "APROBADO" as never,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "HOST_ONLY" });
  });

  it("no re-resuelve un participante con estado final", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue({ ...pendiente, estado: "APROBADO" }),
    });

    await expect(
      resolveParticipant(deps, {
        participanteId: "participante-1",
        hostUsuarioId: HOST_USER_ID,
        nuevoEstado: "APROBADO" as never,
      }),
    ).rejects.toMatchObject({ code: "PARTICIPANT_STATE_CONFLICT" });
  });

  it("409 si la sala no está sincronizada con GetStream", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue({
        ...pendiente,
        sala: {
          ...sala,
          streamRoomId: null,
          streamCallType: null,
          streamCallId: null,
        },
      }),
    });

    await expect(
      resolveParticipant(deps, {
        participanteId: "participante-1",
        hostUsuarioId: HOST_USER_ID,
        nuevoEstado: "APROBADO" as never,
      }),
    ).rejects.toMatchObject({ code: "ROOM_NOT_SYNCED" });
  });
});

describe("requestJoin — reingreso", () => {
  it("no vuelve a crear el participante si ya existe (regresión P2002)", async () => {
    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue({
        ...pendiente,
        estado: "APROBADO",
        fechaIngreso: new Date(),
      }),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(deps.participantes.createPendiente).not.toHaveBeenCalled();
    expect(result.estado).toBe("APROBADO");
    expect(result.accessToken).toBeTypeOf("string");
  });

  it("404 si la sala no existe", async () => {
    const deps = makeDeps();
    deps.salas.findByCodigo = vitest.fn().mockResolvedValue(null) as never;

    await expect(
      requestJoin(deps, {
        salaCodigo: "NOPE",
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@test.com",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
