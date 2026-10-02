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
    INVITADO: "INVITADO",
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

import { beforeEach, describe, expect, it, vi as vitest } from "vitest";
import { requestJoin, type WaitingRoomDeps } from "../services/waitingRoom.service.js";
import { setReunionesNamespace } from "../realtime/registry.js";

const sala = {
  id: "sala-1",
  codigo: "ABCD1234",
  estado: "ACTIVA",
  streamRoomId: "default:call-1",
  streamCallType: "default",
  streamCallId: "call-1",
};

function makeDeps(existente: unknown) {
  return {
    participantes: {
      findByEmail: vitest.fn().mockResolvedValue(existente),
      findByUsuario: vitest.fn().mockResolvedValue(null),
    },
    salas: { findByCodigo: vitest.fn().mockResolvedValue(sala) },
    usuarios: {},
  } as unknown as WaitingRoomDeps;
}

describe("emitJoinPending — nombre/apellido nullables", () => {
  const emit = vitest.fn();
  const to = vitest.fn();

  beforeEach(() => {
    emit.mockReset();
    to.mockReset().mockReturnValue({ emit });
    setReunionesNamespace({ to } as never);
  });

  it("un PENDIENTE sin nombre (INVITADO promovido) se anuncia al host con nombre/apellido null y su email aparte", async () => {
    const deps = makeDeps({
      id: "p-1",
      salaId: "sala-1",
      estado: "PENDIENTE",
      rol: "PARTICIPANTE",
      nombre: null,
      apellido: null,
      email: "ana@test.com",
      fechaIngreso: null,
    });

    await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(to).toHaveBeenCalledWith("sala:sala-1:host");
    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({
        participanteId: "p-1",
        nombre: null,
        apellido: null,
        email: "ana@test.com",
      }),
    );
  });

  it("con nombre y apellido los envía tal cual", async () => {
    const deps = makeDeps({
      id: "p-2",
      salaId: "sala-1",
      estado: "PENDIENTE",
      rol: "PARTICIPANTE",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
      fechaIngreso: null,
    });

    await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({ nombre: "Ana", apellido: "Pérez" }),
    );
  });
});
