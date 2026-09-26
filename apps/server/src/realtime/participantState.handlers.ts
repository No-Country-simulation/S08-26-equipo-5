import type { Namespace } from "socket.io";
import { EstadoParticipante } from "@prisma/client";
import type { IEstadoMedioStore } from "./estadoMedio.store.js";
import { sanitizeMediaPatch } from "./estadoMedio.store.js";
import type { IParticipanteRepository } from "../repositories/participante.repository.js";
import type { ISalaRepository } from "../repositories/sala.repository.js";
import type {
    EstadoMedio,
    ParticipanteConexionPayload,
    ParticipanteEstadoPayload,
    RealtimeSocket,
} from "../types/realtime.types.js";

interface RoomEnterPayload {
    salaCodigo?: string;
    email?: string;
    mic?: unknown;
    cam?: unknown;
    screen?: unknown;
}

interface ParticipantStatePayload {
    mic?: unknown;
    cam?: unknown;
    screen?: unknown;
}

export function registerParticipantStateHandlers(
    nsp: Namespace,
    socket: RealtimeSocket,
    deps: {
        participantes: IParticipanteRepository;
        salas: ISalaRepository;
        estado: IEstadoMedioStore;
    }
) {
    const { participantes, salas, estado } = deps;

    socket.on("room:enter", async (payload: RoomEnterPayload) => {
        try {
            const sala = await salas.findByCodigo(payload?.salaCodigo ?? "");
            if (!sala) {
                return socket.emit("error", { code: "ROOM_NOT_FOUND", message: "No existe una sala con ese código" });
            }

            const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
            const participante = email
                ? await participantes.findAprobadoByEmail(sala.id, email)
                : socket.data.userId
                    ? await participantes.findBySalaAndUsuario(sala.id, socket.data.userId)
                    : null;

            // Identity is resolved server-side; the client never picks a participanteId.
            if (!participante || participante.estado !== EstadoParticipante.APROBADO) {
                return socket.emit("error", {
                    code: "NOT_APPROVED",
                    message: "El participante no está aprobado para esta sala",
                });
            }

            socket.data.salaId = sala.id;
            socket.data.participanteId = participante.id;
            socket.join(`sala:${sala.id}`);
            socket.join(`participante:${participante.id}`);

            const inicial = sanitizeMediaPatch({ mic: payload?.mic, cam: payload?.cam, screen: payload?.screen });

            // Late joiner: replay the live media state of everyone already present.
            for (const presente of estado.listBySala(sala.id)) {
                socket.emit("participant:state", toEstadoPayload(presente.participanteId, presente));
            }

            const { estado: actual, joined } = estado.join(sala.id, participante.id, socket.id, inicial);
            if (joined) {
                broadcastEstado(nsp, sala.id, participante.id, actual);
            }
        } catch {
            socket.emit("error", { code: "INTERNAL_SERVER_ERROR", message: "Ocurrió un error interno" });
        }
    });

    socket.on("participant:state", async (payload: ParticipantStatePayload) => {
        const salaId = socket.data.salaId;
        const participanteId = socket.data.participanteId;
        if (!salaId || !participanteId) {
            return socket.emit("error", {
                code: "NOT_IN_ROOM",
                message: "Debés ingresar a la sala antes de actualizar tu estado",
            });
        }

        const patch = sanitizeMediaPatch({ mic: payload?.mic, cam: payload?.cam, screen: payload?.screen });
        if (Object.keys(patch).length === 0) {
            return socket.emit("error", {
                code: "VALIDATION_ERROR",
                message: "El evento no contiene un estado de medio válido",
            });
        }

        const participante = await participantes.findById(participanteId);
        if (!participante || participante.estado !== EstadoParticipante.APROBADO) {
            return socket.emit("error", {
                code: "NOT_APPROVED",
                message: "Solo los participantes aprobados pueden actualizar su estado",
            });
        }

        broadcastEstado(nsp, salaId, participanteId, estado.merge(salaId, participanteId, patch));
    });

    socket.on("disconnect", () => {
        const salaId = socket.data.salaId;
        const participanteId = socket.data.participanteId;
        if (!salaId || !participanteId) return;

        const { left } = estado.leave(salaId, participanteId, socket.id);
        if (left) {
            broadcastConexion(nsp, salaId, participanteId);
        }

        socket.data.salaId = undefined;
        socket.data.participanteId = undefined;
    });
}

function toEstadoPayload(participanteId: string, estado: EstadoMedio): ParticipanteEstadoPayload {
    return {
        participanteId,
        mic: estado.mic,
        cam: estado.cam,
        screen: estado.screen,
        timestamp: estado.updatedAt,
    };
}

function broadcastEstado(nsp: Namespace, salaId: string, participanteId: string, estado: EstadoMedio) {
    nsp.to(`sala:${salaId}`).emit("participant:state", toEstadoPayload(participanteId, estado));
}

function broadcastConexion(nsp: Namespace, salaId: string, participanteId: string) {
    const payload: ParticipanteConexionPayload = {
        participanteId,
        connection: "disconnected",
        timestamp: new Date().toISOString(),
    };
    nsp.to(`sala:${salaId}`).emit("participant:connection", payload);
}
