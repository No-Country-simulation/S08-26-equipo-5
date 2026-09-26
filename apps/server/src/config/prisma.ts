import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// En test no se cachea: cada archivo de test monta su propio mock de
// PrismaClient y el global se compartiría entre archivos del mismo worker.
if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
  globalForPrisma.prisma = prisma;
}
