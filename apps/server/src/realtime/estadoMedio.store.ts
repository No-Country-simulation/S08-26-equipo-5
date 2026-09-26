import type { EstadoMedio } from "../types/realtime.types.js";

export type MediaPatch = Partial<Omit<EstadoMedio, "updatedAt">>;
export type MediaPatchInput = { mic?: unknown; cam?: unknown; screen?: unknown };

export interface IEstadoMedioStore {
    get(salaId: string, participanteId: string): EstadoMedio | null;
    merge(salaId: string, participanteId: string, patch: MediaPatch): EstadoMedio;
    join(
        salaId: string,
        participanteId: string,
        socketId: string,
        initial: MediaPatch
    ): { estado: EstadoMedio; joined: boolean };
    leave(salaId: string, participanteId: string, socketId: string): { left: boolean };
    listBySala(salaId: string): Array<{ participanteId: string } & EstadoMedio>;
    clear(): void;
}

const estadoInicial = (): EstadoMedio => ({
    mic: false,
    cam: false,
    screen: false,
    updatedAt: new Date().toISOString(),
});

/** Drops any non-boolean value so client input can never corrupt the shape. */
export function sanitizeMediaPatch(patch: MediaPatchInput): MediaPatch {
    const result: MediaPatch = {};
    if (typeof patch.mic === "boolean") result.mic = patch.mic;
    if (typeof patch.cam === "boolean") result.cam = patch.cam;
    if (typeof patch.screen === "boolean") result.screen = patch.screen;
    return result;
}

/**
 * In-memory overlay of who is currently present and their media state.
 * It is NOT the room roster (that lives in the DB); it only tracks live state.
 *
 * The store intentionally holds only online participants: when the last
 * socket of a participant leaves, its entry is dropped. Multiple sockets per
 * participant (tabs/devices) are refcounted so closing one does not remove
 * a participant who is still connected elsewhere.
 */
export class InMemoryEstadoMedioStore implements IEstadoMedioStore {
    private readonly salas = new Map<string, Map<string, EstadoMedio>>();
    private readonly conexiones = new Map<string, Set<string>>();

    private bucket(salaId: string): Map<string, EstadoMedio> {
        let byParticipante = this.salas.get(salaId);
        if (!byParticipante) {
            byParticipante = new Map<string, EstadoMedio>();
            this.salas.set(salaId, byParticipante);
        }
        return byParticipante;
    }

    private conexionesKey(salaId: string, participanteId: string) {
        return `${salaId}:${participanteId}`;
    }

    get(salaId: string, participanteId: string): EstadoMedio | null {
        return this.salas.get(salaId)?.get(participanteId) ?? null;
    }

    /** Last-write-wins per field. Replaying the same patch is a no-op. */
    merge(salaId: string, participanteId: string, patch: MediaPatch): EstadoMedio {
        const bucket = this.bucket(salaId);
        const previo = bucket.get(participanteId) ?? estadoInicial();
        const siguiente: EstadoMedio = {
            ...previo,
            ...patch,
            updatedAt: new Date().toISOString(),
        };
        bucket.set(participanteId, siguiente);
        return siguiente;
    }

    /** A socket appears. Existing entry means another tab is already online. */
    join(salaId: string, participanteId: string, socketId: string, initial: MediaPatch) {
        const key = this.conexionesKey(salaId, participanteId);
        const sockets = this.conexiones.get(key) ?? new Set<string>();
        const joined = sockets.size === 0;

        sockets.add(socketId);
        this.conexiones.set(key, sockets);

        const estado = this.merge(salaId, participanteId, initial);
        return { estado, joined };
    }

    /** A socket leaves. The participant is dropped only when the last one goes. */
    leave(salaId: string, participanteId: string, socketId: string): { left: boolean } {
        const key = this.conexionesKey(salaId, participanteId);
        const sockets = this.conexiones.get(key);

        // Untracked socket (e.g. the waiting-room one): nothing changes.
        if (!sockets || !sockets.has(socketId)) {
            return { left: false };
        }

        sockets.delete(socketId);
        if (sockets.size > 0) {
            return { left: false };
        }

        this.conexiones.delete(key);
        this.salas.get(salaId)?.delete(participanteId);
        return { left: true };
    }

    listBySala(salaId: string): Array<{ participanteId: string } & EstadoMedio> {
        const bucket = this.salas.get(salaId);
        if (!bucket) return [];
        return [...bucket.entries()].map(([participanteId, estado]) => ({
            participanteId,
            ...estado,
        }));
    }

    clear() {
        this.salas.clear();
        this.conexiones.clear();
    }
}
