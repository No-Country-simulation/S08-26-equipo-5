-- AlterTable: separar el CID de GetStream en type + id
-- El SDK del cliente necesita call(type, id) por separado; streamRoomId
-- (el CID completo) se conserva porque el webhook busca la sala por ese campo.
ALTER TABLE "Sala" ADD COLUMN     "streamCallType" VARCHAR(50),
                  ADD COLUMN     "streamCallId"   VARCHAR(100);

-- Backfill de las salas existentes a partir del CID "<type>:<id>"
UPDATE "Sala"
SET "streamCallType" = split_part("streamRoomId", ':', 1),
    "streamCallId"   = split_part("streamRoomId", ':', 2)
WHERE "streamRoomId" IS NOT NULL
  AND position(':' IN "streamRoomId") > 0;

-- Índice para resolver la sala desde un evento de GetStream por callId
CREATE INDEX "Sala_streamCallId_idx" ON "Sala"("streamCallId");
