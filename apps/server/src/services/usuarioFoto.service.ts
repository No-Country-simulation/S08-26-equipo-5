import { randomUUID } from "node:crypto";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { ImageStorage } from "../storage/image-storage.port.js";
import { AppError } from "../utils/AppError.js";
import { detectImageType } from "../utils/imageType.js";

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

/**
 * Datos seguros para loguear de un error del proveedor: SOLO name y http_code.
 * El mensaje crudo puede contener la api_key, así que nunca se loguea.
 */
function safeErrorInfo(error: unknown): { name: string; http_code?: number } {
  const e = (error ?? {}) as { name?: unknown; http_code?: unknown };
  return {
    name: typeof e.name === "string" ? e.name : "UnknownError",
    ...(typeof e.http_code === "number" ? { http_code: e.http_code } : {}),
  };
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
      // publicId opaco por subida: la URL pública no revela el id del usuario
      // y cada foto nueva tiene URL propia (no hace falta invalidar el CDN).
      uploaded = await storage.uploadAvatar(file.buffer, { publicId: randomUUID() });
    } catch (error) {
      console.error("[avatar] Falló la subida a Cloudinary", safeErrorInfo(error));
      throw new AppError(502, "UPLOAD_FAILED", "No se pudo subir la imagen, intentá de nuevo");
    }

    let saved: boolean;
    try {
      saved = await this.users.updateFotoIfUnchanged(userId, user.fotoPublicId ?? null, {
        fotoUrl: uploaded.url,
        fotoPublicId: uploaded.publicId,
      });
    } catch (error) {
      // No dejar el asset recién subido huérfano (best-effort).
      await this.deleteQuietly(uploaded.publicId);
      throw error;
    }
    if (!saved) {
      // Otro PUT ya cambió la fila: este asset quedó sin referenciar.
      await this.deleteQuietly(uploaded.publicId);
      throw new AppError(
        409,
        "PHOTO_UPDATE_CONFLICT",
        "La foto se actualizó en paralelo, intentá de nuevo",
      );
    }

    // Recién con el nuevo persistido se borra el anterior (best-effort).
    if (user.fotoPublicId && user.fotoPublicId !== uploaded.publicId) {
      await this.deleteQuietly(user.fotoPublicId);
    }

    return { fotoUrl: uploaded.url };
  }

  async removeFoto(userId: string): Promise<void> {
    // No exige storage: quitar la foto es solo limpiar la DB. Sin Cloudinary
    // configurado no hay a quién pedirle el borrado remoto (solo PUT da 503).
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
    if (!this.storage) {
      console.warn("[avatar] Cloudinary no configurado: se omite el borrado remoto de la imagen");
      return;
    }
    try {
      await this.storage.delete(publicId);
    } catch (error) {
      console.warn("[avatar] No se pudo borrar la imagen en Cloudinary", safeErrorInfo(error));
    }
  }
}
