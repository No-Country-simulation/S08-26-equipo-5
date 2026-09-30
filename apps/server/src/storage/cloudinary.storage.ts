import { v2 as cloudinary } from "cloudinary";
import type { ImageStorage, UploadedImage } from "./image-storage.port.js";

/**
 * Error sanitizado del SDK. El mensaje original de Cloudinary puede incluir la
 * api_key o fragmentos de la config, así que NO se propaga: solo se conserva
 * el nombre y el http_code para diagnóstico.
 */
export class CloudinaryError extends Error {
  constructor(
    message: string,
    public readonly http_code?: number,
    name?: string,
  ) {
    super(message);
    this.name = name || "CloudinaryError";
  }
}

function sanitize(error: unknown, message: string): CloudinaryError {
  const e = (error ?? {}) as { http_code?: unknown; name?: unknown };
  return new CloudinaryError(
    message,
    typeof e.http_code === "number" ? e.http_code : undefined,
    typeof e.name === "string" ? e.name : undefined,
  );
}

export class CloudinaryStorage implements ImageStorage {
  constructor(private readonly folder: string) {}

  uploadAvatar(buffer: Buffer, opts: { publicId: string }): Promise<UploadedImage> {
    const publicId = `${this.folder}/${opts.publicId}`;

    return new Promise<UploadedImage>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: "image",
          // 256x256 centrado en la cara; el original nunca se sirve.
          transformation: [
            { width: 256, height: 256, crop: "fill", gravity: "face" },
            { quality: "auto", fetch_format: "auto" },
          ],
        },
        (error, result) => {
          if (error) {
            return reject(sanitize(error, "Cloudinary upload failed"));
          }
          if (!result?.secure_url) {
            return reject(new CloudinaryError("Cloudinary no devolvió secure_url"));
          }
          // secure_url incluye /v<version>/: el cache del CDN se rompe solo.
          resolve({ url: result.secure_url, publicId: result.public_id ?? publicId });
        },
      );
      stream.end(buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
    } catch (error) {
      throw sanitize(error, "Cloudinary delete failed");
    }
  }
}

/**
 * Crea el storage o devuelve null si no hay CLOUDINARY_URL (las fotos quedan
 * deshabilitadas pero el servidor arranca igual).
 *
 * Parsea la URL a mano (cloudinary://key:secret@cloud_name) en vez de
 * depender de que el SDK lea process.env antes que dotenv. Los mensajes de
 * error nunca incluyen la URL ni el secret.
 */
export function createImageStorage(config: {
  cloudinaryUrl?: string;
  folder: string;
}): ImageStorage | null {
  if (!config.cloudinaryUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(config.cloudinaryUrl);
  } catch {
    throw new Error("CLOUDINARY_URL inválida. Formato: cloudinary://key:secret@cloud_name");
  }

  if (parsed.protocol !== "cloudinary:" || !parsed.username || !parsed.password || !parsed.hostname) {
    throw new Error("CLOUDINARY_URL inválida. Formato: cloudinary://key:secret@cloud_name");
  }

  cloudinary.config({
    cloud_name: parsed.hostname,
    api_key: decodeURIComponent(parsed.username),
    api_secret: decodeURIComponent(parsed.password),
    secure: true,
  });

  return new CloudinaryStorage(config.folder);
}
