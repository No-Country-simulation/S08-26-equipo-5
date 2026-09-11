import { PrismaClient } from "@prisma/client";

// Definimos un objeto global seguro para almacenar la instancia de Prisma en memoria de Node.js
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// * ============================================================================
// * PATRÓN DE INSTANCIA ÚNICA (SINGLETON) PARA DESARROLLO
// * ============================================================================
// ? NOTA:
// * El patrón globalForPrisma evita que tsx watch abra una conexión nueva a Neon 
// * en cada hot-reload — sin esto, en dev vas acumulando conexiones hasta agotar el pool.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// En entornos de desarrollo (development), guardamos la instancia en globalThis 
// para que sobreviva a las recargas en caliente del servidor (hot-reload).
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}