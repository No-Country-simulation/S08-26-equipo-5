import type { Socket } from "socket.io";

export type ConexionEstado = "connected" | "disconnected";

/**
 * Live media state of a participant. Ephemeral: it only describes the
 * current connection, never persisted, never a source of truth.
 */
export interface EstadoMedio {
    mic: boolean;
    cam: boolean;
    screen: boolean;
    updatedAt: string;
}

export interface ParticipanteEstadoPayload {
    participanteId: string;
    mic: boolean;
    cam: boolean;
    screen: boolean;
    timestamp: string;
}

export interface ParticipanteConexionPayload {
    participanteId: string;
    connection: ConexionEstado;
    timestamp: string;
}

/**
 * Identity bound server-side during room:enter / join:request.
 * Never populated from client payloads.
 */
export type RealtimeSocketData = {
    userId?: string;
    salaId?: string;
    participanteId?: string;
};

export type RealtimeSocket = Socket & { data: RealtimeSocketData };
