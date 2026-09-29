import { PrismaClient, Sala } from "@prisma/client";

export interface ISalaRepository {
    findByCodigo(codigo: string): Promise<Sala | null>;
    findById(id: string): Promise<Sala | null>;
}

export class PrismaSalaRepository implements ISalaRepository {
    constructor(private readonly prisma: PrismaClient) { }

    /** El código se normaliza a mayúsculas: así se guarda al crear la sala. */
    async findByCodigo(codigo: string) {
        return this.prisma.sala.findUnique({
            where: { codigo: codigo.trim().toUpperCase() },
        });
    }

    async findById(id: string) {
        return this.prisma.sala.findUnique({ where: { id } });
    }
}
