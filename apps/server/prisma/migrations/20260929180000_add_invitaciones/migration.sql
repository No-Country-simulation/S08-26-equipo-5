-- AlterEnum
ALTER TYPE "EstadoParticipante" ADD VALUE 'INVITADO';

-- AlterTable
ALTER TABLE "Participante" ALTER COLUMN "nombre" DROP NOT NULL,
ALTER COLUMN "apellido" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Invitacion" (
    "id" UUID NOT NULL,
    "participanteId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invitadoPorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitacion_participanteId_key" ON "Invitacion"("participanteId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitacion_tokenHash_key" ON "Invitacion"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitacion_invitadoPorId_idx" ON "Invitacion"("invitadoPorId");

-- AddForeignKey
ALTER TABLE "Invitacion" ADD CONSTRAINT "Invitacion_participanteId_fkey" FOREIGN KEY ("participanteId") REFERENCES "Participante"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitacion" ADD CONSTRAINT "Invitacion_invitadoPorId_fkey" FOREIGN KEY ("invitadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

