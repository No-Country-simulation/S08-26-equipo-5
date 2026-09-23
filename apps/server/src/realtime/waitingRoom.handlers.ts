import { Namespace, Socket } from "socket.io";
import { EstadoParticipante } from "@prisma/client";
import { IParticipanteRepository } from "../repositories/participante.repository.js";
import { ISalaRepository } from "../repositories/sala.repository.js";

interface JoinRequestPayload {
    salaCodigo: string;
    nombre: string;
    apellido: string;
    email: string;
}
interface ParticipantActionPayload {
    participanteId: string;
}

export function registerWaitingRoomHandlers(
    nsp: Namespace,
    socket: Socket & { data: { userId?: string } },
    deps: { participantes: IParticipanteRepository; salas: ISalaRepository }
) {
    const { participantes, salas } = deps;

    socket.on("join:request", async (payload: JoinRequestPayload) => {
        try {
            const sala = await salas.findByCodigo(payload.salaCodigo);
            if (!sala) {
                return socket.emit("error", { code: "ROOM_NOT_FOUND", message: "No existe una sala con ese código" });
            }

            const existente = await participantes.findPendienteByEmail(sala.id, payload.email);
            const participante =
                existente ??
                (await participantes.createPendiente({
                    salaId: sala.id,
                    usuarioId: socket.data.userId ?? null,
                    nombre: payload.nombre,
                    apellido: payload.apellido,
                    email: payload.email,
                }));

            socket.join(`participante:${participante.id}`);
            socket.join(`sala:${sala.id}`);

            nsp.to(`sala:${sala.id}:host`).emit("join:pending", {
                participanteId: participante.id,
                nombre: participante.nombre,
                apellido: participante.apellido,
                email: participante.email,
                timestamp: new Date().toISOString(),
            });
        } catch {
            socket.emit("error", { code: "INTERNAL_SERVER_ERROR", message: "Ocurrió un error interno" });
        }
    });

    socket.on("host:subscribe", async ({ salaId }: { salaId: string }) => {
        if (!socket.data.userId) {
            return socket.emit("error", { code: "UNAUTHORIZED", message: "Token ausente, inválido o expirado" });
        }
        const esHost = await participantes.findHost(salaId, socket.data.userId);
        if (!esHost) {
            return socket.emit("error", { code: "HOST_ONLY", message: "Solo el HOST puede suscribirse" });
        }
        socket.join(`sala:${salaId}:host`);
    });

    socket.on("participant:approve", (payload: ParticipantActionPayload) =>
        resolveParticipant(nsp, socket, participantes, payload.participanteId, EstadoParticipante.APROBADO)
    );

    socket.on("participant:reject", (payload: ParticipantActionPayload) =>
        resolveParticipant(nsp, socket, participantes, payload.participanteId, EstadoParticipante.RECHAZADO)
    );
}

async function resolveParticipant(
    nsp: Namespace,
    socket: Socket & { data: { userId?: string } },
    participantes: IParticipanteRepository,
    participanteId: string,
    nuevoEstado: EstadoParticipante
) {
    const participante = await participantes.findById(participanteId);
    if (!participante) {
        return socket.emit("error", { code: "NOT_FOUND", message: "Participante no encontrado" });
    }

    if (!socket.data.userId) {
        return socket.emit("error", { code: "UNAUTHORIZED", message: "Token ausente, inválido o expirado" });
    }

    const esHost = await participantes.findHost(participante.sala.id, socket.data.userId);
    if (!esHost) {
        return socket.emit("error", { code: "HOST_ONLY", message: "Solo el HOST puede actualizar participantes" });
    }

    if (participante.estado !== EstadoParticipante.PENDIENTE) {
        return socket.emit("error", {
            code: "PARTICIPANT_STATE_CONFLICT",
            message: "El participante ya tiene un estado final",
        });
    }

    const actualizado = await participantes.updateEstado(
        participanteId,
        nuevoEstado,
        nuevoEstado === EstadoParticipante.APROBADO ? new Date() : undefined
    );

    const evento = nuevoEstado === EstadoParticipante.APROBADO ? "join:approved" : "join:rejected";
    nsp.to(`participante:${participanteId}`).emit(evento, {
        sala: { id: participante.sala.id, codigo: participante.sala.codigo, estado: participante.sala.estado },
        streamCallId: nuevoEstado === EstadoParticipante.APROBADO ? `call_${participante.sala.codigo.toLowerCase()}` : null,
    });

    const activos = await participantes.findAprobadosBySala(participante.sala.id);
    nsp.to(`sala:${participante.sala.id}`).emit("room:state", {
        salaId: participante.sala.id,
        estado: participante.sala.estado,
        participantes: activos,
    });
}