export type ImageType = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

/**
 * Detecta el tipo REAL de una imagen leyendo sus magic bytes. No se confía en
 * el mimetype ni en la extensión que declara el cliente: ambos son
 * controlados por quien sube el archivo.
 *
 * Soporta solo los formatos aceptados para avatares (JPEG, PNG, WebP).
 * Devuelve null para cualquier otra cosa (GIF, SVG, PDF, RIFF no-WebP, etc.).
 */
export function detectImageType(buf: Buffer): ImageType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, PNG_SIGNATURE)) return "png";
  // WebP: "RIFF" <4 bytes de tamaño> "WEBP"
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  return null;
}
