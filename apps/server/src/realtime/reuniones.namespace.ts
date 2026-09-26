import { Server, Namespace } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma.js";
import { PrismaParticipanteRepository } from "../repositories/participante.repository.js";
import { PrismaSalaRepository } from "../repositories/sala.repository.js";
import { registerWaitingRoomHandlers } from "./waitingRoom.handlers.js";
import { registerParticipantStateHandlers } from "./participantState.handlers.js";
import { InMemoryEstadoMedioStore } from "./estadoMedio.store.js";

export function createReunionesNamespace(io: Server): Namespace {
    const nsp = io.of("/reuniones");
    const participantes = new PrismaParticipanteRepository(prisma);
    const salas = new PrismaSalaRepository(prisma);
    // One store per namespace: shared by every socket, lifetime of the process.
    const estado = new InMemoryEstadoMedioStore();

    nsp.use((socket: any, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next();
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
            socket.data.userId = payload.sub;
            next();
        } catch {
            next(new Error("INVALID_TOKEN"));
        }
    });

    nsp.on("connection", (socket: any) => {
        registerWaitingRoomHandlers(nsp, socket, { participantes, salas });
        registerParticipantStateHandlers(nsp, socket, { participantes, salas, estado });
    });

    return nsp;
}