import type { IUserRepository } from "../repositories/user.repository.js";
import type { ImageStorage } from "../storage/image-storage.port.js";
import { AppError } from "../utils/AppError.js";
import { detectImageType } from "../utils/imageType.js";

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "error desconocido";
}

export class UsuarioFotoService {
  constructor(
    private readonly users: IUserRepository,
    /** null cuando no hay CLOUDINARY_URL: los endpoints responden 503. */
    private readonly storage: ImageStorage | null,
    private readonly opts: { maxBytes: number },
  ) {}

  /** Lanza 503 si no hay proveedor configurado. Devuelve el storage ya no-null. */
  assertEnabled(): ImageStorage {
    if (!this.storage) {
      throw new AppError(
        503,
        "UPLOADS_NOT_CONFIGURED",
        "La subida de imágenes no está configurada en este servidor",
      );
    }
    return this.storage;
  }

  async setFoto(userId: string, file: UploadedFile | undefined): Promise<{ fotoUrl: string }> {
    const storage = this.assertEnabled();

    if (!file || file.size === 0 || file.buffer.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Se requiere una imagen");
    }
    if (file.size > this.opts.maxBytes || file.buffer.length > this.opts.maxBytes) {
      throw new AppError(
        413,
        "FILE_TOO_LARGE",
        `La imagen supera el máximo de ${this.opts.maxBytes} bytes`,
      );
    }
    // Se ignora el mimetype/extensión declarados: manda el contenido real.
    if (!detectImageType(file.buffer)) {
      throw new AppError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Formato no soportado. Usá JPEG, PNG o WebP",
      );
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    }

    let uploaded;
    try {
      uploaded = await storage.uploadAvatar(file.buffer, { publicId: userId });
    } catch (error) {
      // Solo el mensaje: el error del SDK puede arrastrar la config/credenciales.
      console.error("[avatar] Falló la subida a Cloudinary:", errorMessage(error));
      throw new AppError(502, "UPLOAD_FAILED", "No se pudo subir la imagen, intentá de nuevo");
    }

    await this.users.updateFoto(userId, {
      fotoUrl: uploaded.url,
      fotoPublicId: uploaded.publicId,
    });

    // El publicId es determinístico, así que normalmente se pisa el mismo
    // asset. Si cambió la carpeta configurada, limpiamos el viejo (best-effort).
    if (user.fotoPublicId && user.fotoPublicId !== uploaded.publicId) {
      await this.deleteQuietly(user.fotoPublicId);
    }

    return { fotoUrl: uploaded.url };
  }

  async removeFoto(userId: string): Promise<void> {
    this.assertEnabled();

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    }
    if (!user.fotoUrl && !user.fotoPublicId) return; // idempotente

    if (user.fotoPublicId) {
      await this.deleteQuietly(user.fotoPublicId);
    }
    // La DB se limpia siempre: el usuario pidió quitar su foto aunque el
    // proveedor falle (un asset huérfano es menos grave que una foto imposible de quitar).
    await this.users.updateFoto(userId, { fotoUrl: null, fotoPublicId: null });
  }

  private async deleteQuietly(publicId: string): Promise<void> {
    try {
      await this.storage?.delete(publicId);
    } catch (error) {
      console.warn("[avatar] No se pudo borrar la imagen en Cloudinary:", errorMessage(error));
    }
  }
}
