import {
    PrismaClient,
    Participante,
    Invitacion,
    Sala,
    RolParticipante,
    EstadoParticipante,
} from "@prisma/client";
import { AppError } from "../utils/AppError.js";

export type InvitacionConParticipante = Invitacion & {
    participante: Participante & { sala: Sala };
};

export interface CrearInvitadoData {
    salaId: string;
    email: string;
    /** Solo si el email pertenece a una cuenta registrada. */
    usuarioId: string | null;
    nombre: string | null;
    apellido: string | null;
    tokenHash: string;
    expiresAt: Date;
    invitadoPorId: string;
}

export interface RotarTokenData {
    participanteId: string;
    tokenHash: string;
    expiresAt: Date;
    invitadoPorId: string;
}

export interface ConsumirYActivarData {
    invitacionId: string;
    participanteId: string;
    /** Solo para invitados no registrados: se guardan al aceptar. */
    nombre?: string;
    apellido?: string;
}

export interface ConsumirYActivarResult {
    /** false: la invitación ya estaba usada/vencida (o perdió la carrera). */
    invitacionConsumida: boolean;
    /** false: el participante ya no estaba INVITADO (ej.: ya se unió por código). */
    participanteActivado: boolean;
}

export interface IInvitacionRepository {
    /** Crea Participante INVITADO + Invitacion de forma atómica (nested create). */
    crearInvitado(data: CrearInvitadoData): Promise<Participante>;
    /** Reenvío: nuevo hash/vencimiento y limpia usedAt; el token anterior queda inválido. */
    rotarToken(data: RotarTokenData): Promise<Invitacion>;
    findByTokenHash(tokenHash: string): Promise<InvitacionConParticipante | null>;
    /**
     * Unidad atómica de la aceptación: consume la invitación y promueve
     * INVITADO → PENDIENTE. El `count` del update condicional es la verdad
     * ante aceptaciones concurrentes: solo una gana.
     */
    consumirYActivar(data: ConsumirYActivarData): Promise<ConsumirYActivarResult>;
}

/** Centinela interno: fuerza el rollback de la transacción de aceptación. */
class ActivacionPerdidaError extends Error { }

export class PrismaInvitacionRepository implements IInvitacionRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async crearInvitado(data: CrearInvitadoData) {
        try {
            return await this.prisma.participante.create({
                data: {
                    salaId: data.salaId,
                    email: data.email.trim().toLowerCase(),
                    usuarioId: data.usuarioId,
                    nombre: data.nombre,
                    apellido: data.apellido,
                    rol: RolParticipante.PARTICIPANTE,
                    estado: EstadoParticipante.INVITADO,
                    invitacion: {
                        create: {
                            tokenHash: data.tokenHash,
                            expiresAt: data.expiresAt,
                            invitadoPorId: data.invitadoPorId,
                        },
                    },
                },
            });
        } catch (error) {
            // Carrera entre dos invitaciones al mismo email/usuario en la sala.
            if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                (error as { code?: unknown }).code === "P2002"
            ) {
                throw new AppError(
                    409,
                    "ALREADY_PARTICIPANT",
                    "El participante ya existe en la sala",
                );
            }
            throw error;
        }
    }

    async rotarToken(data: RotarTokenData) {
        return this.prisma.invitacion.update({
            where: { participanteId: data.participanteId },
            data: {
                tokenHash: data.tokenHash,
                expiresAt: data.expiresAt,
                usedAt: null,
                invitadoPorId: data.invitadoPorId,
            },
        });
    }

    async findByTokenHash(tokenHash: string) {
        return this.prisma.invitacion.findUnique({
            where: { tokenHash },
            include: { participante: { include: { sala: true } } },
        });
    }

    async consumirYActivar(data: ConsumirYActivarData): Promise<ConsumirYActivarResult> {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const ahora = new Date();

                const invitacion = await tx.invitacion.updateMany({
                    where: { id: data.invitacionId, usedAt: null, expiresAt: { gt: ahora } },
                    data: { usedAt: ahora },
                });
                if (invitacion.count === 0) {
                    return { invitacionConsumida: false, participanteActivado: false };
                }

                const participante = await tx.participante.updateMany({
                    where: { id: data.participanteId, estado: EstadoParticipante.INVITADO },
                    data: {
                        estado: EstadoParticipante.PENDIENTE,
                        ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
                        ...(data.apellido !== undefined ? { apellido: data.apellido } : {}),
                    },
                });
                // Si el participante ya no está INVITADO, revertir también el
                // usedAt: el token no debe quemarse sin activar a nadie.
                if (participante.count !== 1) {
                    throw new ActivacionPerdidaError();
                }

                return { invitacionConsumida: true, participanteActivado: true };
            });
        } catch (error) {
            if (error instanceof ActivacionPerdidaError) {
                return { invitacionConsumida: false, participanteActivado: false };
            }
            throw error;
        }
    }
}
