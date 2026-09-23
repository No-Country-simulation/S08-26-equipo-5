import { PrismaClient, Participante, RolParticipante, EstadoParticipante } from "@prisma/client";

export interface IParticipanteRepository {
    findHost(salaId: string, usuarioId: string): Promise<Participante | null>;
    findById(participanteId: string): Promise<(Participante & { sala: { id: string; codigo: string; estado: string } }) | null>;
    findPendienteByEmail(salaId: string, email: string): Promise<Participante | null>;
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
        fechaIngreso?: Date
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
            include: { sala: { select: { id: true, codigo: true, estado: true } } },
        });
    }

    async findPendienteByEmail(salaId: string, email: string) {
        return this.prisma.participante.findFirst({
            where: { salaId, email, estado: EstadoParticipante.PENDIENTE },
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
            data: { ...data, estado: EstadoParticipante.PENDIENTE, rol: RolParticipante.PARTICIPANTE },
        });
    }

    async updateEstado(participanteId: string, estado: EstadoParticipante, fechaIngreso?: Date) {
        return this.prisma.participante.update({
            where: { id: participanteId },
            data: { estado, fechaIngreso },
        });
    }

    async findAprobadosBySala(salaId: string) {
        return this.prisma.participante.findMany({
            where: { salaId, estado: EstadoParticipante.APROBADO },
            select: { id: true, nombre: true, estado: true },
        });
    }
}