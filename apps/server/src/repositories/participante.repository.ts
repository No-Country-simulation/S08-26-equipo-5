import { PrismaClient, Participante, RolParticipante, EstadoParticipante } from "@prisma/client";
import { AppError } from "../utils/AppError.js";

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
    /**
     * Busca por (salaId, usuarioId) — el unique real de la tabla. Necesario
     * para detectar que un usuario logueado (típicamente el HOST) ya es
     * participante de la sala aunque pida el join con un email distinto al
     * de su cuenta: `findByEmail` no lo encontraría.
     */
    findByUsuario(salaId: string, usuarioId: string): Promise<Participante | null>;
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
    /**
     * Update condicional (WHERE estado = PENDIENTE) para aprobar/rechazar sin
     * pisar una resolución concurrente. Devuelve la cantidad de filas
     * afectadas: 0 significa que alguien más ya lo resolvió primero (la
     * lectura previa por findById quedó stale) y el caller debe tratarlo
     * como conflicto, no reintentar el update.
     */
    resolveEstadoSiPendiente(
        participanteId: string,
        estado: EstadoParticipante,
        fechaIngreso: Date | null
    ): Promise<number>;
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

    async findByUsuario(salaId: string, usuarioId: string) {
        return this.prisma.participante.findUnique({
            where: { salaId_usuarioId: { salaId, usuarioId } },
        });
    }

    async createPendiente(data: {
        salaId: string;
        usuarioId: string | null;
        nombre: string;
        apellido: string;
        email: string;
    }) {
        try {
            return await this.prisma.participante.create({
                data: {
                    ...data,
                    email: data.email.trim().toLowerCase(),
                    estado: EstadoParticipante.PENDIENTE,
                    rol: RolParticipante.PARTICIPANTE,
                },
            });
        } catch (error) {
            // P2002: violación del unique [salaId, usuarioId] (o [salaId, email]).
            // Pasa cuando dos requests de join concurrentes para el mismo
            // participante corren la carrera entre el findByEmail/findByUsuario
            // y este create. Antes explotaba como 500 sin manejar.
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                (error as { code?: unknown }).code === "P2002"
            ) {
                throw new AppError(
                    409,
                    "ALREADY_PARTICIPANT",
                    "Ya sos participante de esta sala",
                );
            }
            throw error;
        }
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

    async resolveEstadoSiPendiente(
        participanteId: string,
        estado: EstadoParticipante,
        fechaIngreso: Date | null
    ) {
        const result = await this.prisma.participante.updateMany({
            where: { id: participanteId, estado: EstadoParticipante.PENDIENTE },
            data: { estado, fechaIngreso },
        });
        return result.count;
    }

    async findAprobadosBySala(salaId: string) {
        return this.prisma.participante.findMany({
            where: { salaId, estado: EstadoParticipante.APROBADO },
            select: { id: true, nombre: true, estado: true },
        });
    }
}
