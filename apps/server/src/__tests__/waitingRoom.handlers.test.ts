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
import { registerWaitingRoomHandlers } from "../realtime/waitingRoom.handlers.js";
import type { WaitingRoomDeps } from "../services/waitingRoom.service.js";

const SALA_ID = "sala-1";
const PARTICIPANTE_ID = "participante-victima";
const OWNER_USER_ID = "usuario-dueño";

const participanteConSala = {
  id: PARTICIPANTE_ID,
  salaId: SALA_ID,
  usuarioId: OWNER_USER_ID,
  estado: "APROBADO",
  rol: "PARTICIPANTE",
  sala: { id: SALA_ID },
};

/** Doble mínimo de un socket de Socket.IO: registra listeners y permite dispararlos a mano. */
function createFakeSocket(data: Record<string, unknown> = {}) {
  const listeners = new Map<string, (...args: any[]) => unknown>();
  return {
    data,
    on(event: string, cb: (...args: any[]) => unknown) {
      listeners.set(event, cb);
    },
    join: vitest.fn(),
    emit: vitest.fn(),
    async trigger(event: string, ...args: unknown[]) {
      const cb = listeners.get(event);
      if (!cb) throw new Error(`No hay listener registrado para "${event}"`);
      return cb(...args);
    },
  };
}

function makeDeps(overrides: Partial<WaitingRoomDeps["participantes"]> = {}) {
  const participantes = {
    findHost: vitest.fn(),
    findById: vitest.fn().mockResolvedValue(participanteConSala),
    findByEmail: vitest.fn(),
    findByUsuario: vitest.fn(),
    createPendiente: vitest.fn(),
    updateEstado: vitest.fn(),
    resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(1),
    findAprobadosBySala: vitest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const salas = {
    findByCodigo: vitest.fn(),
    findById: vitest.fn(),
  };
  return { participantes, salas } as unknown as WaitingRoomDeps & {
    participantes: typeof participantes;
  };
}

beforeEach(() => vi.clearAllMocks());

describe("join:subscribe — ownership", () => {
  it("rechaza a un socket anónimo (sin userId ni participanteId)", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({});
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: PARTICIPANTE_ID }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "FORBIDDEN" }),
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("rechaza a un socket con guest JWT de OTRO participante", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({ participanteId: "otro-participante" });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: PARTICIPANTE_ID }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "FORBIDDEN" }),
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("rechaza a un usuario logueado que NO es dueño del participante", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({ userId: "otro-usuario" });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: PARTICIPANTE_ID }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "FORBIDDEN" }),
    });
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("permite al invitado dueño (guest JWT con su propio participanteId)", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({ participanteId: PARTICIPANTE_ID });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: PARTICIPANTE_ID }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: true, estado: "APROBADO" });
    expect(socket.join).toHaveBeenCalledWith(`participante:${PARTICIPANTE_ID}`);
    expect(socket.join).toHaveBeenCalledWith(`sala:${SALA_ID}`);
  });

  it("permite al usuario registrado dueño del participante (usuarioId coincide)", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({ userId: OWNER_USER_ID });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: PARTICIPANTE_ID }, ack);

    expect(ack).toHaveBeenCalledWith({ ok: true, estado: "APROBADO" });
    expect(socket.join).toHaveBeenCalledWith(`participante:${PARTICIPANTE_ID}`);
  });

  it("404 si el participante no existe (no filtra si es por ownership o inexistencia)", async () => {
    const deps = makeDeps({ findById: vitest.fn().mockResolvedValue(null) });
    const socket = createFakeSocket({ participanteId: "cualquiera" });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger("join:subscribe", { participanteId: "no-existe" }, ack);

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "NOT_FOUND" }),
    });
  });
});

describe("join:request — valida el payload igual que el HTTP", () => {
  // Antes, join:request por socket no validaba nada: le pasaba el payload
  // crudo a requestJoin. Un email inválido (o campos vacíos) terminaba
  // creando un Participante con datos basura en vez de un 400 claro.
  it("email inválido → error ack con VALIDATION_ERROR, no crea participante", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({});
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger(
      "join:request",
      {
        salaCodigo: "ABCD1234",
        nombre: "Ana",
        apellido: "Pérez",
        email: "no-es-un-email",
      },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
    expect(deps.participantes.createPendiente).not.toHaveBeenCalled();
    expect(socket.join).not.toHaveBeenCalled();
  });

  it("faltan campos → error ack con VALIDATION_ERROR, no crea participante", async () => {
    const deps = makeDeps();
    const socket = createFakeSocket({});
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger(
      "join:request",
      { salaCodigo: "ABCD1234", nombre: "", apellido: "", email: "" },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
    });
    expect(deps.participantes.createPendiente).not.toHaveBeenCalled();
  });
});

describe("participant:approve / participant:reject — sin doble emisión en carrera", () => {
  const salaConStream = {
    id: SALA_ID,
    codigo: "ABCD1234",
    estado: "ACTIVA",
    streamRoomId: "default:abc-123",
    streamCallType: "default",
    streamCallId: "abc-123",
  };
  const pendienteConSala = {
    id: PARTICIPANTE_ID,
    salaId: SALA_ID,
    rol: "PARTICIPANTE",
    estado: "PENDIENTE",
    sala: salaConStream,
  };

  it("la segunda resolución (count 0) responde 409 por ack y NO emite nada", async () => {
    // Simula la carrera: el update condicional ya lo ganó otra resolución,
    // así que esta segunda llamada tiene que fallar sin tocar el socket.
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendienteConSala),
      findHost: vitest.fn().mockResolvedValue({ id: "host-participante" }),
      resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(0),
    });
    const socket = createFakeSocket({ userId: "host-user-1" });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger(
      "participant:approve",
      { participanteId: PARTICIPANTE_ID },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: expect.objectContaining({ code: "PARTICIPANT_STATE_CONFLICT" }),
    });
    // No hay evento de error hacia OTROS sockets ni join:approved: el único
    // "emit" posible acá sería el de error de este mismo socket, y no debe
    // haber ningún llamado a broadcastResolution (que requeriría el
    // namespace real; si se hubiese invocado con este stub, hubiese tirado).
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(
      "error",
      expect.objectContaining({ code: "PARTICIPANT_STATE_CONFLICT" }),
    );
  });

  it("la primera resolución (count 1) sí resuelve ok", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendienteConSala),
      findHost: vitest.fn().mockResolvedValue({ id: "host-participante" }),
      resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(1),
    });
    const socket = createFakeSocket({ userId: "host-user-1" });
    registerWaitingRoomHandlers({} as never, socket as never, deps);

    const ack = vitest.fn();
    await socket.trigger(
      "participant:reject",
      { participanteId: PARTICIPANTE_ID },
      ack,
    );

    expect(ack).toHaveBeenCalledWith({ ok: true, estado: "RECHAZADO" });
    expect(socket.emit).not.toHaveBeenCalledWith(
      "error",
      expect.anything(),
    );
  });
});
