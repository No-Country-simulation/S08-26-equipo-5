-- AlterTable: foto de perfil del usuario (subida via Cloudinary)
-- fotoUrl: URL publica (secure_url, incluye version para invalidar cache).
-- fotoPublicId: id en Cloudinary, uso interno para reemplazar/borrar.
ALTER TABLE "Usuario" ADD COLUMN     "fotoUrl" VARCHAR(500),
                      ADD COLUMN     "fotoPublicId" VARCHAR(255);
