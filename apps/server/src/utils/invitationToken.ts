import crypto from "crypto";

const TOKEN_BYTES = 32;

/** Token opaco de invitación: 32 bytes aleatorios en base64url. Solo viaja por correo. */
export function generateInvitationToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex: lo único que se persiste. Con 256 bits de entropía no hace falta salt. */
export function hashInvitationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
