import { Server, Namespace, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { PrismaParticipanteRepository } from "../repositories/participante.repository.js";
import { PrismaSalaRepository } from "../repositories/sala.repository.js";
import { registerWaitingRoomHandlers } from "./waitingRoom.handlers.js";
import { setReunionesNamespace } from "./registry.js";
import { verifyParticipantToken } from "../utils/participantToken.js";
import { rooms } from "./registry.js";

export function createReunionesNamespace(io: Server): Namespace {
    const nsp = io.of("/reuniones");
    const participantes = new PrismaParticipanteRepository(prisma);
    const salas = new PrismaSalaRepository(prisma);
    const deps = { participantes, salas };

    // Los controllers HTTP emiten por este namespace (join:pending, etc.).
    setReunionesNamespace(nsp);

    nsp.use((socket: Socket & { data: any }, next) => {
        const token = socket.handshake.auth?.token;
        // La conexión anónima está permitida: un invitado sin cuenta se
        // identifica después, con join:request o con su guest JWT.
        if (!token) return next();

        // Guest JWT del participante.
        const guest = verifyParticipantToken(token);
        if (guest) {
            socket.data.participanteId = guest.sub;
            socket.data.salaId = guest.salaId;
            return next();
        }

        // Access token de usuario registrado.
        try {
            const payload = jwt.verify(token, env.jwtSecret) as { sub: string };
            socket.data.userId = payload.sub;
            next();
        } catch {
            next(new Error("INVALID_TOKEN"));
        }
    });

    nsp.on("connection", (socket: Socket & { data: any }) => {
        // Si se conectó con guest JWT ya sabemos quién es: lo suscribimos
        // a sus rooms para que sobreviva a un refresh de la página.
        if (socket.data.participanteId) {
            socket.join(rooms.participante(socket.data.participanteId));
            if (socket.data.salaId) socket.join(rooms.sala(socket.data.salaId));
        }

        registerWaitingRoomHandlers(nsp, socket, deps);
    });

    return nsp;
}
