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

import { beforeEach, describe, expect, it } from "vitest";
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

const invitado = {
  id: "p-1",
  salaId: "sala-1",
  estado: "INVITADO",
  rol: "PARTICIPANTE",
  usuarioId: null,
  nombre: null,
  apellido: null,
  email: "ana@test.com",
  fechaIngreso: null,
};

function makeDeps(existente: unknown, activados = 1, releido: unknown = null) {
  const participantes = {
    findByEmail: vi.fn().mockResolvedValue(existente),
    findByUsuario: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(releido),
    activarInvitado: vi.fn().mockResolvedValue(activados),
    createPendiente: vi.fn(),
    updateEstado: vi.fn(),
  };
  const deps = {
    participantes,
    salas: { findByCodigo: vi.fn().mockResolvedValue(sala) },
    usuarios: {},
  } as unknown as WaitingRoomDeps;
  return { deps, participantes };
}

describe("requestJoin — rama INVITADO", () => {
  const emit = vi.fn();
  const to = vi.fn();

  beforeEach(() => {
    emit.mockReset();
    to.mockReset().mockReturnValue({ emit });
    setReunionesNamespace({ to } as never);
  });

  it("no registrado: promueve a PENDIENTE con nombre/apellido, emite join:pending y no duplica la fila", async () => {
    const { deps, participantes } = makeDeps(invitado);

    const res = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(participantes.activarInvitado).toHaveBeenCalledWith("p-1", {
      nombre: "Ana",
      apellido: "Pérez",
    });
    expect(participantes.createPendiente).not.toHaveBeenCalled();
    expect(res).toMatchObject({ participanteId: "p-1", estado: "PENDIENTE", salaId: "sala-1" });
    expect(res.accessToken).toEqual(expect.any(String));
    expect(to).toHaveBeenCalledWith("sala:sala-1:host");
    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({ participanteId: "p-1", nombre: "Ana", apellido: "Pérez" }),
    );
  });

  it("no pisa nombre/apellido si la fila ya los tiene", async () => {
    const { deps, participantes } = makeDeps({ ...invitado, nombre: "Ana", apellido: "Gómez" });

    await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Otra",
      apellido: "Persona",
      email: "ana@test.com",
    });

    expect(participantes.activarInvitado).toHaveBeenCalledWith("p-1", undefined);
    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({ nombre: "Ana", apellido: "Gómez" }),
    );
  });

  it("fila de usuario registrado y caller sin sesion -> 401 LOGIN_REQUIRED sin promover", async () => {
    const { deps, participantes } = makeDeps({
      ...invitado,
      usuarioId: "u-1",
      nombre: "Ana",
      apellido: "Pérez",
    });

    await expect(
      requestJoin(deps, {
        salaCodigo: "ABCD1234",
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@test.com",
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: "LOGIN_REQUIRED" });
    expect(participantes.activarInvitado).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("fila de usuario registrado y caller con OTRA cuenta -> 401 LOGIN_REQUIRED", async () => {
    const { deps, participantes } = makeDeps({ ...invitado, usuarioId: "u-1", nombre: "Ana", apellido: "P" });

    await expect(
      requestJoin(deps, {
        salaCodigo: "ABCD1234",
        nombre: "X",
        apellido: "Y",
        email: "ana@test.com",
        usuarioId: "u-2",
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: "LOGIN_REQUIRED" });
    expect(participantes.activarInvitado).not.toHaveBeenCalled();
  });

  it("fila de usuario registrado y caller con esa cuenta -> promueve", async () => {
    const { deps, participantes } = makeDeps({
      ...invitado,
      usuarioId: "u-1",
      nombre: "Ana",
      apellido: "Pérez",
    });

    const res = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
      usuarioId: "u-1",
    });

    expect(participantes.activarInvitado).toHaveBeenCalledWith("p-1", undefined);
    expect(res.estado).toBe("PENDIENTE");
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("carrera perdida (count 0): relee la fila y sigue la rama normal sin error", async () => {
    const { deps } = makeDeps(invitado, 0, {
      ...invitado,
      estado: "PENDIENTE",
      nombre: "Ana",
      apellido: "Pérez",
      sala,
    });

    const res = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(res.estado).toBe("PENDIENTE");
    expect(res.participanteId).toBe("p-1");
  });
});
