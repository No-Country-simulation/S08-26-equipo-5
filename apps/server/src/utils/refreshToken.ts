import crypto from "crypto";

const TOKEN_BYTES = 48;

export function generateRefreshToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
