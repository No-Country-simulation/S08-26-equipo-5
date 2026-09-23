import { PrismaClient, Sala } from "@prisma/client";

export interface ISalaRepository {
    findByCodigo(codigo: string): Promise<Sala | null>;
}

export class PrismaSalaRepository implements ISalaRepository {
    constructor(private readonly prisma: PrismaClient) { }

    async findByCodigo(codigo: string) {
        return this.prisma.sala.findUnique({ where: { codigo } });
    }
}