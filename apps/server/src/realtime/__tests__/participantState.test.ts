import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Namespace } from "socket.io";

vi.mock("@prisma/client", () => ({
    EstadoParticipante: { PENDIENTE: "PENDIENTE", APROBADO: "APROBADO", RECHAZADO: "RECHAZADO" },
}));

import { InMemoryEstadoMedioStore, sanitizeMediaPatch } from "../estadoMedio.store.js";
import { registerParticipantStateHandlers } from "../participantState.handlers.js";
import type { RealtimeSocket, RealtimeSocketData } from "../../types/realtime.types.js";

type Emission = { room: string; event: string; payload: any };

function createFakeNsp() {
    const emissions: Emission[] = [];
    const nsp = {
        to: (room: string) => ({
            emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
        }),
    } as unknown as Namespace;
    return { nsp, emissions };
}

function createFakeSocket(id = "sock-1", data: RealtimeSocketData = {}) {
    const handlers = new Map<string, (payload?: any) => any>();
    const join = vi.fn();
    const emit = vi.fn();
    const socket = {
        id,
        data,
        join,
        emit,
        on: (event: string, handler: (payload?: any) => any) => handlers.set(event, handler),
    } as unknown as RealtimeSocket;
    return { socket, join, emit, fire: (event: string, payload?: unknown) => handlers.get(event)?.(payload) };
}

function createDeps() {
    return {
        participantes: {
            findHost: vi.fn(),
            findById: vi.fn(),
            findPendienteByEmail: vi.fn(),
            createPendiente: vi.fn(),
            updateEstado: vi.fn(),
            findAprobadosBySala: vi.fn(),
            findAprobadoByEmail: vi.fn(),
            findBySalaAndUsuario: vi.fn(),
        },
        salas: { findByCodigo: vi.fn() },
        estado: new InMemoryEstadoMedioStore(),
    };
}

describe("S3-09 — estado de medios realtime", () => {
    describe("estadoMedio.store", () => {
        it("sanitizeMediaPatch descarta valores no booleanos", () => {
            expect(sanitizeMediaPatch({ mic: true, cam: "sí", screen: 1 })).toEqual({ mic: true });
        });

        it("merge es idempotente y preserva campos ausentes", () => {
            const store = new InMemoryEstadoMedioStore();
            store.merge("s1", "p1", { mic: true, cam: true });
            const a = store.merge("s1", "p1", { screen: true });
            const b = store.merge("s1", "p1", { screen: true });

            expect(a.mic).toBe(true);
            expect(a.cam).toBe(true);
            expect(a.screen).toBe(true);
            expect(b).toEqual(a);
        });

        it("join reporta joined solo en el primer socket", () => {
            const store = new InMemoryEstadoMedioStore();
            expect(store.join("s1", "p1", "sockA", { mic: true }).joined).toBe(true);
            expect(store.join("s1", "p1", "sockB", { mic: true }).joined).toBe(false);
        });

        it("leave NO borra al participante si queda otra pestaña", () => {
            const store = new InMemoryEstadoMedioStore();
            store.join("s1", "p1", "sockA", { mic: true });
            store.join("s1", "p1", "sockB", { mic: true });

            expect(store.leave("s1", "p1", "sockB").left).toBe(false);
            expect(store.get("s1", "p1")).not.toBeNull();
        });

        it("leave borra al participante al cerrar el último socket", () => {
            const store = new InMemoryEstadoMedioStore();
            store.join("s1", "p1", "sockA", { mic: true });
            store.join("s1", "p1", "sockB", { mic: true });

            store.leave("s1", "p1", "sockA");
            expect(store.leave("s1", "p1", "sockB").left).toBe(true);
            expect(store.get("s1", "p1")).toBeNull();
        });

        it("leave es idempotente ante un socket no trackeado (waiting room)", () => {
            const store = new InMemoryEstadoMedioStore();
            expect(store.leave("s1", "p1", "no-existe").left).toBe(false);
        });

        it("listBySala devuelve solo la sala pedida", () => {
            const store = new InMemoryEstadoMedioStore();
            store.join("s1", "p1", "sockA", { mic: true });
            store.join("s1", "p2", "sockB", { cam: true });

            expect(store.listBySala("s1")).toHaveLength(2);
            expect(store.listBySala("otra")).toEqual([]);
        });
    });

    describe("participantState.handlers", () => {
        let deps: ReturnType<typeof createDeps>;
        let nsp: Namespace;
        let emissions: Emission[];

        beforeEach(() => {
            deps = createDeps();
            ({ nsp, emissions } = createFakeNsp());
        });

        it("room:enter rechaza sala inexistente", async () => {
            deps.salas.findByCodigo.mockResolvedValue(null);
            const { socket, fire, emit } = createFakeSocket();
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("room:enter", { salaCodigo: "NOPE" });

            expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "ROOM_NOT_FOUND" }));
        });

        it("room:enter resuelve identidad server-side y bindea socket.data", async () => {
            deps.salas.findByCodigo.mockResolvedValue({ id: "s1", codigo: "SAL-1", estado: "ACTIVA" });
            deps.participantes.findAprobadoByEmail.mockResolvedValue({ id: "p1", estado: "APROBADO" });
            const { socket, fire, join } = createFakeSocket();
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("room:enter", { salaCodigo: "SAL-1", email: "  ALICE@Example.COM " });

            expect(deps.participantes.findAprobadoByEmail).toHaveBeenCalledWith("s1", "alice@example.com");
            expect(socket.data.salaId).toBe("s1");
            expect(socket.data.participanteId).toBe("p1");
            expect(join).toHaveBeenCalledWith("sala:s1");
        });

        it("room:enter rechaza a un participante no aprobado", async () => {
            deps.salas.findByCodigo.mockResolvedValue({ id: "s1", codigo: "SAL-1", estado: "ACTIVA" });
            deps.participantes.findAprobadoByEmail.mockResolvedValue({ id: "p1", estado: "PENDIENTE" });
            const { socket, fire, emit } = createFakeSocket();
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("room:enter", { salaCodigo: "SAL-1", email: "a@b.com" });

            expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "NOT_APPROVED" }));
        });

        it("room:enter replaya el estado de los presentes al que ingresa", async () => {
            deps.salas.findByCodigo.mockResolvedValue({ id: "s1", codigo: "SAL-1", estado: "ACTIVA" });
            deps.participantes.findAprobadoByEmail.mockResolvedValue({ id: "p1", estado: "APROBADO" });
            deps.estado.join("s1", "p2", "sock-otro", { mic: true, screen: true });
            const { socket, fire, emit } = createFakeSocket();
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("room:enter", { salaCodigo: "SAL-1", email: "a@b.com" });

            expect(emit).toHaveBeenCalledWith(
                "participant:state",
                expect.objectContaining({ participanteId: "p2", mic: true, screen: true })
            );
        });

        it("participant:state sin ingresar a la sala → NOT_IN_ROOM", async () => {
            const { socket, fire, emit } = createFakeSocket();
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("participant:state", { mic: false });

            expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "NOT_IN_ROOM" }));
        });

        it("participant:state con payload inválido → VALIDATION_ERROR", async () => {
            const { socket, fire, emit } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("participant:state", { mic: "no", cam: 3 });

            expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "VALIDATION_ERROR" }));
        });

        it("ignora un participanteId spoofeado del payload y usa socket.data", async () => {
            deps.participantes.findById.mockResolvedValue({ id: "p1", estado: "APROBADO" });
            const { socket, fire } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("participant:state", { participanteId: "p99", mic: true });

            expect(emissions).toHaveLength(1);
            expect(emissions[0].payload.participanteId).toBe("p1");
        });

        it("participant:state de un no aprobado → NOT_APPROVED", async () => {
            deps.participantes.findById.mockResolvedValue({ id: "p1", estado: "PENDIENTE" });
            const { socket, fire, emit } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("participant:state", { mic: true });

            expect(emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "NOT_APPROVED" }));
        });

        it("participant:state aprobado → broadcast a sala:{id}", async () => {
            deps.participantes.findById.mockResolvedValue({ id: "p1", estado: "APROBADO" });
            const { socket, fire } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            await fire("participant:state", { mic: true, cam: false, screen: true });

            expect(emissions[0].room).toBe("sala:s1");
            expect(emissions[0].event).toBe("participant:state");
            expect(emissions[0].payload).toMatchObject({ mic: true, cam: false, screen: true });
        });

        it("disconnect del último socket → participant:connection disconnected", () => {
            deps.estado.join("s1", "p1", "sock-1", {});
            const { socket, fire } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            fire("disconnect");

            const conexion = emissions.find((e) => e.event === "participant:connection");
            expect(conexion?.room).toBe("sala:s1");
            expect(conexion?.payload).toMatchObject({ participanteId: "p1", connection: "disconnected" });
        });

        it("disconnect con otra pestaña viva NO emite disconnected", () => {
            deps.estado.join("s1", "p1", "sock-1", {});
            deps.estado.join("s1", "p1", "sock-2", {});
            const { socket, fire } = createFakeSocket("sock-1", { salaId: "s1", participanteId: "p1" });
            registerParticipantStateHandlers(nsp, socket, deps);

            fire("disconnect");

            expect(emissions.find((e) => e.event === "participant:connection")).toBeUndefined();
            expect(deps.estado.get("s1", "p1")).not.toBeNull();
        });
    });
});
