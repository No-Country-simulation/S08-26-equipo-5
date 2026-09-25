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
  validateJoinInput,
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
    findByUsuario: vitest.fn().mockResolvedValue(null),
    createPendiente: vitest.fn(),
    updateEstado: vitest.fn().mockResolvedValue({}),
    resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(1),
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
    expect(deps.participantes.resolveEstadoSiPendiente).toHaveBeenCalledWith(
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
      // count 0: el update condicional (WHERE estado = PENDIENTE) no matcheó.
      resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(0),
    });

    await expect(
      resolveParticipant(deps, {
        participanteId: "participante-1",
        hostUsuarioId: HOST_USER_ID,
        nuevoEstado: "APROBADO" as never,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "PARTICIPANT_STATE_CONFLICT" });
  });

  // BLOCKER de carrera: approve y reject (o dos approve) disparados casi a
  // la vez leían el mismo estado PENDIENTE por findById (TOCTOU) y los dos
  // terminaban actualizando y emitiendo join:approved/join:rejected. Ahora
  // la fuente de verdad es un UPDATE condicional (WHERE estado = PENDIENTE):
  // solo una de las dos resoluciones concurrentes matchea (count 1), la
  // otra recibe count 0 → 409 y el handler nunca llega a emitir nada para
  // ella (ver waitingRoom.handlers.test.ts para el caso end-to-end del socket).
  it("la segunda resolución concurrente (count 0) no devuelve un ResolveResult para emitir", async () => {
    const deps = makeDeps({
      findById: vitest.fn().mockResolvedValue(pendiente), // lectura stale: todavía PENDIENTE
      resolveEstadoSiPendiente: vitest.fn().mockResolvedValue(0),
    });

    await expect(
      resolveParticipant(deps, {
        participanteId: "participante-1",
        hostUsuarioId: HOST_USER_ID,
        nuevoEstado: "RECHAZADO" as never,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "PARTICIPANT_STATE_CONFLICT" });
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

describe("requestJoin — accessToken también para PENDIENTE", () => {
  // BLOCKER de seguridad: antes, un PENDIENTE no recibía ningún token, así
  // que el único modo de "autenticar" su socket para join:subscribe era
  // mandar el participanteId a pelo — cualquiera podía suscribirse a
  // cualquier participante y recibir su join:approved (con el accessToken
  // de otro invitado adentro). Ahora el guest JWT se emite también en
  // PENDIENTE: stream-token y mi-estado ya lo gatean por estado (authParticipante),
  // así que emitirlo temprano no da acceso de más, solo permite autenticar
  // el socket con `auth: { token }` antes de pedir la suscripción.
  it("un participante nuevo (PENDIENTE) recibe accessToken", async () => {
    const deps = makeDeps({
      createPendiente: vitest.fn().mockResolvedValue({
        id: "participante-nuevo",
        salaId: SALA_ID,
        rol: "PARTICIPANTE",
        estado: "PENDIENTE",
      }),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(result.estado).toBe("PENDIENTE");
    expect(result.accessToken).toBeTypeOf("string");

    const claims = verifyParticipantToken(result.accessToken!);
    expect(claims?.sub).toBe("participante-nuevo");
    expect(claims?.salaId).toBe(SALA_ID);
  });

  it("un PENDIENTE que reintenta el join también recibe accessToken", async () => {
    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue(pendiente),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(result.estado).toBe("PENDIENTE");
    expect(result.accessToken).toBeTypeOf("string");
    expect(verifyParticipantToken(result.accessToken!)?.sub).toBe(pendiente.id);
  });

  it("una aprobación vencida vuelve a PENDIENTE y también recibe accessToken", async () => {
    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue({
        ...pendiente,
        estado: "APROBADO",
        fechaIngreso: new Date(Date.now() - 999 * 60 * 60 * 1000),
      }),
      updateEstado: vitest.fn().mockResolvedValue({
        ...pendiente,
        estado: "PENDIENTE",
        fechaIngreso: null,
      }),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
    });

    expect(result.estado).toBe("PENDIENTE");
    expect(result.accessToken).toBeTypeOf("string");
  });
});

describe("validateJoinInput — validador compartido HTTP/socket", () => {
  const valido = {
    salaCodigo: "ABCD1234",
    nombre: "Ana",
    apellido: "Pérez",
    email: "ana@test.com",
  };

  it("normaliza (trim) y devuelve el payload cuando es válido", () => {
    expect(
      validateJoinInput({
        salaCodigo: "  ABCD1234  ",
        nombre: " Ana ",
        apellido: " Pérez ",
        email: " ana@test.com ",
      }),
    ).toEqual(valido);
  });

  it("400 si falta el código de sala", () => {
    expect(() => validateJoinInput({ ...valido, salaCodigo: "" })).toThrow(
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
  });

  it("400 si faltan campos requeridos", () => {
    expect(() => validateJoinInput({ ...valido, nombre: "" })).toThrow(
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
  });

  it("400 si el email no es válido", () => {
    expect(() => validateJoinInput({ ...valido, email: "no-es-un-email" })).toThrow(
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
  });
});

describe("requestJoin — el HOST entra a su propia sala con otro email", () => {
  // Bug real: el HOST ya tiene una fila de Participante (única por
  // [salaId, usuarioId]) desde que creó la sala. Si vuelve a pedir join con
  // un email distinto al de su cuenta (findByEmail no la encuentra),
  // createPendiente intentaba insertar una segunda fila para el mismo
  // (salaId, usuarioId) → P2002 → 500 sin manejar.
  const hostRow = {
    id: "participante-host",
    salaId: SALA_ID,
    usuarioId: "usuario-host",
    estado: "APROBADO",
    rol: "HOST",
    nombre: "El Host",
    apellido: "",
    email: "host@empresa.com",
    fechaIngreso: new Date(Date.now() - 999 * 60 * 60 * 1000), // "vencido" si se mirara la ventana
  };

  it("reutiliza la fila del HOST en vez de crear una nueva (sin 500)", async () => {
    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue(null),
      findByUsuario: vitest.fn().mockResolvedValue(hostRow),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "El Host",
      apellido: "",
      email: "otro-email-cualquiera@gmail.com",
      usuarioId: "usuario-host",
    });

    expect(result.estado).toBe("APROBADO");
    expect(result.participanteId).toBe("participante-host");
    expect(result.accessToken).toBeTypeOf("string");
    // El HOST no pasa por la ventana de reingreso (fechaIngreso vieja no lo
    // baja a PENDIENTE) ni crea una fila nueva.
    expect(deps.participantes.createPendiente).not.toHaveBeenCalled();
    expect(deps.participantes.updateEstado).not.toHaveBeenCalled();
  });

  // Defensivo: un HOST "no debería" estar nunca en otro estado que no sea
  // APROBADO (transferHost ahora lo garantiza), pero si por datos viejos o
  // un bug futuro aparece una fila HOST no-APROBADO, requestJoin no puede
  // devolver un accessToken + estado APROBADO mentiroso: authParticipante
  // igual la rechazaría en stream-token (403 JOIN_NOT_APPROVED) con un
  // accessToken que el cliente ya cree válido. Corrige el dato antes de
  // responder.
  it("HOST con estado no-APROBADO: lo corrige a APROBADO antes de devolver el resultado", async () => {
    const hostPendiente = { ...hostRow, estado: "PENDIENTE", fechaIngreso: null };
    const hostActualizado = { ...hostPendiente, estado: "APROBADO", fechaIngreso: new Date() };

    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue(null),
      findByUsuario: vitest.fn().mockResolvedValue(hostPendiente),
      updateEstado: vitest.fn().mockResolvedValue(hostActualizado),
    });

    const result = await requestJoin(deps, {
      salaCodigo: "ABCD1234",
      nombre: "El Host",
      apellido: "",
      email: "otro-email-cualquiera@gmail.com",
      usuarioId: "usuario-host",
    });

    expect(deps.participantes.updateEstado).toHaveBeenCalledWith(
      "participante-host",
      "APROBADO",
      expect.any(Date),
    );
    expect(result.estado).toBe("APROBADO");
    expect(result.participanteId).toBe("participante-host");
    expect(result.accessToken).toBeTypeOf("string");
  });

  it("propaga el 409 ALREADY_PARTICIPANT que el repo mapea de un P2002 (carrera concurrente)", async () => {
    // El mapeo P2002 → AppError vive en PrismaParticipanteRepository.createPendiente
    // (ver participante.repository.test.ts); acá solo verificamos que
    // requestJoin no se lo trague ni lo transforme en otra cosa.
    const deps = makeDeps({
      findByEmail: vitest.fn().mockResolvedValue(null),
      findByUsuario: vitest.fn().mockResolvedValue(null),
      createPendiente: vitest
        .fn()
        .mockRejectedValue(
          new AppError(409, "ALREADY_PARTICIPANT", "Ya sos participante de esta sala"),
        ),
    });

    await expect(
      requestJoin(deps, {
        salaCodigo: "ABCD1234",
        nombre: "Ana",
        apellido: "Pérez",
        email: "concurrente@test.com",
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_PARTICIPANT" });
  });
});
