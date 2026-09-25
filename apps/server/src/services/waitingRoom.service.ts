import { EstadoParticipante, Participante, RolParticipante } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import {
  signParticipantToken,
  participantTokenExpiresAt,
} from "../utils/participantToken.js";
import {
  getReunionesNamespace,
  rooms,
} from "../realtime/registry.js";
import type {
  IParticipanteRepository,
  ParticipanteConSala,
  SalaDelParticipante,
} from "../repositories/participante.repository.js";
import type { ISalaRepository } from "../repositories/sala.repository.js";
import type { RoomRole } from "../types/stream.js";

export interface WaitingRoomDeps {
  participantes: IParticipanteRepository;
  salas: ISalaRepository;
}

export interface JoinRequestInput {
  salaCodigo: string;
  nombre: string;
  apellido: string;
  email: string;
  usuarioId?: string | null;
}

export interface JoinRequestResult {
  participanteId: string;
  estado: EstadoParticipante;
  salaId: string;
  /** Solo cuando el participante ya estaba aprobado y reingresa a tiempo. */
  accessToken?: string;
  stream?: StreamCallRef;
}

export interface StreamCallRef {
  callType: string;
  callId: string;
  callCid: string;
}

/**
 * Referencia al call de GetStream de una sala.
 * Devuelve null si la sala nunca se sincronizó con GetStream.
 */
export function getStreamCallRef(sala: {
  streamRoomId: string | null;
  streamCallType: string | null;
  streamCallId: string | null;
}): StreamCallRef | null {
  // Camino normal: columnas dedicadas.
  if (sala.streamCallType && sala.streamCallId) {
    return {
      callType: sala.streamCallType,
      callId: sala.streamCallId,
      callCid: `${sala.streamCallType}:${sala.streamCallId}`,
    };
  }

  // Fallback para salas creadas antes de la migración: parsear el CID.
  if (sala.streamRoomId?.includes(":")) {
    const [callType, ...rest] = sala.streamRoomId.split(":");
    const callId = rest.join(":");
    if (callType && callId) {
      return { callType, callId, callCid: sala.streamRoomId };
    }
  }

  return null;
}

/** Lanza 409 si la sala no admite ingresos en este momento. */
function assertSalaJoinable(estado: string): void {
  if (estado === "CANCELADA") {
    throw new AppError(409, "ROOM_CANCELLED", "La sala fue cancelada");
  }
  if (estado === "FINALIZADA") {
    throw new AppError(409, "ROOM_FINISHED", "La reunión ya finalizó");
  }
}

/**
 * ¿El participante aprobado puede reingresar sin volver a pedir permiso?
 *
 * Se permite mientras no expire la ventana del guest JWT. Pasado ese plazo
 * vuelve a PENDIENTE: la identidad del invitado es solo su email, así que no
 * conviene que una aprobación de ayer siga habilitando tokens hoy.
 */
function dentroDeVentanaDeReingreso(fechaIngreso: Date | null): boolean {
  if (!fechaIngreso) return false;
  const vencimiento =
    fechaIngreso.getTime() + env.participantTokenTtlSeconds * 1000;
  return Date.now() < vencimiento;
}

function emitJoinPending(
  salaId: string,
  participante: Participante,
): void {
  getReunionesNamespace()
    ?.to(rooms.salaHost(salaId))
    .emit("join:pending", {
      participanteId: participante.id,
      nombre: participante.nombre,
      apellido: participante.apellido,
      email: participante.email,
      timestamp: new Date().toISOString(),
    });
}

/**
 * Alta o reutilización de un participante en la sala de espera.
 * Lo usan por igual POST /salas/:code/join y el evento join:request.
 */
export async function requestJoin(
  deps: WaitingRoomDeps,
  input: JoinRequestInput,
): Promise<JoinRequestResult> {
  const sala = await deps.salas.findByCodigo(input.salaCodigo);
  if (!sala) {
    throw new AppError(
      404,
      "ROOM_NOT_FOUND",
      "No existe una sala con ese código",
    );
  }

  assertSalaJoinable(sala.estado);

  // El usuario logueado (típicamente el HOST) puede ya ser participante de
  // esta sala bajo un email distinto al que mandó en el form — findByEmail
  // no lo vería. Buscarlo también por (salaId, usuarioId), que es el unique
  // real: crear una fila nueva ahí rompía con P2002 → 500.
  const existentePorUsuario = input.usuarioId
    ? await deps.participantes.findByUsuario(sala.id, input.usuarioId)
    : null;

  // El HOST siempre puede volver a entrar: no lo sometemos a la ventana de
  // reingreso (pensada para invitados sin cuenta) ni creamos una fila nueva.
  if (existentePorUsuario && existentePorUsuario.rol === RolParticipante.HOST) {
    return {
      participanteId: existentePorUsuario.id,
      estado: EstadoParticipante.APROBADO,
      salaId: sala.id,
      accessToken: signParticipantToken({
        participanteId: existentePorUsuario.id,
        salaId: sala.id,
        rol: existentePorUsuario.rol as RoomRole,
      }),
      stream: getStreamCallRef(sala) ?? undefined,
    };
  }

  const existente =
    (await deps.participantes.findByEmail(sala.id, input.email)) ??
    existentePorUsuario;

  // ── Ya existe: decidir según su estado ────────────────────
  if (existente) {
    if (existente.estado === EstadoParticipante.RECHAZADO) {
      throw new AppError(
        403,
        "JOIN_REJECTED",
        "El host rechazó tu solicitud de ingreso",
      );
    }

    if (existente.estado === EstadoParticipante.APROBADO) {
      if (dentroDeVentanaDeReingreso(existente.fechaIngreso)) {
        return {
          participanteId: existente.id,
          estado: EstadoParticipante.APROBADO,
          salaId: sala.id,
          accessToken: signParticipantToken({
            participanteId: existente.id,
            salaId: sala.id,
            rol: existente.rol as RoomRole,
          }),
          stream: getStreamCallRef(sala) ?? undefined,
        };
      }

      // Aprobación vencida: vuelve a la cola y el host decide de nuevo.
      const reiniciado = await deps.participantes.updateEstado(
        existente.id,
        EstadoParticipante.PENDIENTE,
        null,
      );
      emitJoinPending(sala.id, reiniciado);
      return {
        participanteId: reiniciado.id,
        estado: EstadoParticipante.PENDIENTE,
        salaId: sala.id,
        accessToken: signParticipantToken({
          participanteId: reiniciado.id,
          salaId: sala.id,
          rol: reiniciado.rol as RoomRole,
        }),
      };
    }

    // PENDIENTE: reutilizar y volver a avisar al host (pudo recargar el panel).
    emitJoinPending(sala.id, existente);
    return {
      participanteId: existente.id,
      estado: EstadoParticipante.PENDIENTE,
      salaId: sala.id,
      accessToken: signParticipantToken({
        participanteId: existente.id,
        salaId: sala.id,
        rol: existente.rol as RoomRole,
      }),
    };
  }

  // ── Nuevo participante ────────────────────────────────────
  const participante = await deps.participantes.createPendiente({
    salaId: sala.id,
    usuarioId: input.usuarioId ?? null,
    nombre: input.nombre,
    apellido: input.apellido,
    email: input.email,
  });

  emitJoinPending(sala.id, participante);

  return {
    participanteId: participante.id,
    estado: EstadoParticipante.PENDIENTE,
    salaId: sala.id,
    // El PENDIENTE también recibe un guest JWT. No da acceso de más: los
    // endpoints protegidos (stream-token, participant:approve, etc.) siguen
    // exigiendo estado APROBADO por su cuenta (authParticipante,
    // resolveParticipant). Sirve para que el socket se autentique con
    // `auth: { token }` antes de suscribirse a sus propios eventos
    // (join:subscribe), en vez de mandar el participanteId a pelo.
    accessToken: signParticipantToken({
      participanteId: participante.id,
      salaId: sala.id,
      rol: participante.rol as RoomRole,
    }),
  };
}

export interface JoinApprovedPayload {
  participanteId: string;
  /** Guest JWT: con esto el invitado pide su token de GetStream. */
  accessToken: string;
  expiresAt: string;
  sala: { id: string; codigo: string; estado: string };
  /** @deprecated usar `stream.callId`. Se mantiene por compatibilidad. */
  streamCallId: string | null;
  stream: StreamCallRef | null;
}

/**
 * Payload del evento join:approved.
 * Incluye el callId REAL de GetStream y la credencial del invitado.
 */
export function buildJoinApprovedPayload(
  participante: { id: string; rol: string },
  sala: SalaDelParticipante,
): JoinApprovedPayload {
  const stream = getStreamCallRef(sala);

  return {
    participanteId: participante.id,
    accessToken: signParticipantToken({
      participanteId: participante.id,
      salaId: sala.id,
      rol: participante.rol as RoomRole,
    }),
    expiresAt: participantTokenExpiresAt().toISOString(),
    sala: { id: sala.id, codigo: sala.codigo, estado: sala.estado },
    streamCallId: stream?.callId ?? null,
    stream,
  };
}

export interface ResolveResult {
  participante: ParticipanteConSala;
  payload: JoinApprovedPayload | { sala: JoinApprovedPayload["sala"] };
  evento: "join:approved" | "join:rejected";
}

/**
 * Aprueba o rechaza a un participante. Valida que quien resuelve sea el HOST
 * de esa sala y que el participante siga PENDIENTE.
 */
export async function resolveParticipant(
  deps: WaitingRoomDeps,
  args: {
    participanteId: string;
    hostUsuarioId: string;
    nuevoEstado: EstadoParticipante;
  },
): Promise<ResolveResult> {
  const participante = await deps.participantes.findById(args.participanteId);
  if (!participante) {
    throw new AppError(404, "NOT_FOUND", "Participante no encontrado");
  }

  const esHost = await deps.participantes.findHost(
    participante.sala.id,
    args.hostUsuarioId,
  );
  if (!esHost) {
    throw new AppError(
      403,
      "HOST_ONLY",
      "Solo el HOST puede actualizar participantes",
    );
  }

  if (participante.estado !== EstadoParticipante.PENDIENTE) {
    throw new AppError(
      409,
      "PARTICIPANT_STATE_CONFLICT",
      "El participante ya tiene un estado final",
    );
  }

  const aprobado = args.nuevoEstado === EstadoParticipante.APROBADO;

  if (aprobado && !getStreamCallRef(participante.sala)) {
    throw new AppError(
      409,
      "ROOM_NOT_SYNCED",
      "La sala no está sincronizada con GetStream",
    );
  }

  await deps.participantes.updateEstado(
    args.participanteId,
    args.nuevoEstado,
    aprobado ? new Date() : null,
  );

  return {
    participante,
    evento: aprobado ? "join:approved" : "join:rejected",
    payload: aprobado
      ? buildJoinApprovedPayload(participante, participante.sala)
      : {
          sala: {
            id: participante.sala.id,
            codigo: participante.sala.codigo,
            estado: participante.sala.estado,
          },
        },
  };
}

/**
 * Notifica el resultado al participante y refresca el estado de la sala.
 * `room:state` se emite a la sala Y al room del host: son rooms distintos,
 * así que emitir solo al primero dejaba al host sin la actualización.
 */
export async function broadcastResolution(
  deps: WaitingRoomDeps,
  result: ResolveResult,
): Promise<void> {
  const nsp = getReunionesNamespace();
  if (!nsp) return;

  const salaId = result.participante.sala.id;

  nsp
    .to(rooms.participante(result.participante.id))
    .emit(result.evento, result.payload);

  const activos = await deps.participantes.findAprobadosBySala(salaId);
  const estadoSala = {
    salaId,
    estado: result.participante.sala.estado,
    participantes: activos,
  };

  nsp.to(rooms.sala(salaId)).emit("room:state", estadoSala);
  nsp.to(rooms.salaHost(salaId)).emit("room:state", estadoSala);
}
