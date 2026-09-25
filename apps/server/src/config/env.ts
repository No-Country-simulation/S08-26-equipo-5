import "dotenv/config";
import type jwt from "jsonwebtoken";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Parseo estricto (fail-closed): solo "true"|"1" → true, "false"|"0" → false,
// undefined/"" → null (cae al default por NODE_ENV). Cualquier otro valor
// ("True", "yes", ...) revienta al boot en vez de silenciar el flag.
function parseBool(name: string, value: string | undefined): boolean | null {
  if (value === undefined || value === "") return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(
    `Valor inválido para ${name}: "${value}". Valores permitidos: "true" | "1" | "false" | "0"`
  );
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "15m") as jwt.SignOptions["expiresIn"],
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  // Firma HMAC de los webhooks GetStream (fail-closed): requerida por
  // defecto solo en producción; en dev/test se puede forzar con
  // WEBHOOK_SIGNATURE_REQUIRED=true|1|false|0 (valores no canónicos → error al boot).
  webhookSignatureRequired:
    parseBool("WEBHOOK_SIGNATURE_REQUIRED", process.env.WEBHOOK_SIGNATURE_REQUIRED) ??
    (process.env.NODE_ENV === "production"),
};
