import { PrismaClient, Participante, RolParticipante, EstadoParticipante } from "@prisma/client";

/**
 * Datos de la sala que necesita el flujo de ingreso. Incluye la referencia al
 * call de GetStream: sin streamCallType/streamCallId no se puede emitir un
 * token ni decirle al cliente a qué call unirse.
 */
export interface SalaDelParticipante {
    id: string;
    codigo: string;
    estado: string;
    streamRoomId: string | null;
    streamCallType: string | null;
    streamCallId: string | null;
}

export type ParticipanteConSala = Participante & { sala: SalaDelParticipante };

const SALA_SELECT = {
    id: true,
    codigo: true,
    estado: true,
    streamRoomId: true,
    streamCallType: true,
    streamCallId: true,
} as const;

export interface IParticipanteRepository {
    findHost(salaId: string, usuarioId: string): Promise<Participante | null>;
    findById(participanteId: string): Promise<ParticipanteConSala | null>;
    /** Busca por email en cualquier estado (necesario para el reingreso). */
    findByEmail(salaId: string, email: string): Promise<Participante | null>;
    createPendiente(data: {
        salaId: string;
        usuarioId: string | null;
        nombre: string;
        apellido: string;
        email: string;
    }): Promise<Participante>;
    updateEstado(
        participanteId: string,
        estado: EstadoParticipante,
        fechaIngreso?: Date | null
    ): Promise<Participante>;
    findAprobadosBySala(salaId: string): Promise<Pick<Participante, "id" | "nombre" | "estado">[]>;
}

export class PrismaParticipanteRepository implements IParticipanteRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findHost(salaId: string, usuarioId: string) {
        return this.prisma.participante.findFirst({
            where: { salaId, usuarioId, rol: RolParticipante.HOST },
        });
    }

    async findById(participanteId: string) {
        return this.prisma.participante.findUnique({
            where: { id: participanteId },
            include: { sala: { select: SALA_SELECT } },
        });
    }

    /**
     * Búsqueda case-insensitive: los emails nuevos se guardan en minúsculas,
     * pero pueden existir filas anteriores con otra capitalización y el unique
     * [salaId, email] de Postgres sí distingue mayúsculas.
     */
    async findByEmail(salaId: string, email: string) {
        return this.prisma.participante.findFirst({
            where: {
                salaId,
                email: { equals: email.trim(), mode: "insensitive" },
            },
        });
    }

    async createPendiente(data: {
        salaId: string;
        usuarioId: string | null;
        nombre: string;
        apellido: string;
        email: string;
    }) {
        return this.prisma.participante.create({
            data: {
                ...data,
                email: data.email.trim().toLowerCase(),
                estado: EstadoParticipante.PENDIENTE,
                rol: RolParticipante.PARTICIPANTE,
            },
        });
    }

    async updateEstado(
        participanteId: string,
        estado: EstadoParticipante,
        fechaIngreso?: Date | null
    ) {
        return this.prisma.participante.update({
            where: { id: participanteId },
            data: {
                estado,
                ...(fechaIngreso !== undefined ? { fechaIngreso } : {}),
            },
        });
    }

    async findAprobadosBySala(salaId: string) {
        return this.prisma.participante.findMany({
            where: { salaId, estado: EstadoParticipante.APROBADO },
            select: { id: true, nombre: true, estado: true },
        });
    }
}
