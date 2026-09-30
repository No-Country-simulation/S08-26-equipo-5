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

// Entero positivo con default. Vacío/undefined → default; cualquier otra cosa
// que no sea entero > 0 revienta al boot (fail-closed, como parseBool).
function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Valor inválido para ${name}: "${value}". Debe ser un entero positivo`);
  }
  return n;
}

const MAIL_PROVIDERS = ["console", "resend", "brevo"] as const;
export type MailProvider = (typeof MAIL_PROVIDERS)[number];

function parseMailProvider(value: string | undefined): MailProvider {
  if (value === undefined || value === "") return "console";
  if ((MAIL_PROVIDERS as readonly string[]).includes(value)) return value as MailProvider;
  throw new Error(
    `Valor inválido para MAIL_PROVIDER: "${value}". Valores permitidos: ${MAIL_PROVIDERS.join(" | ")}`
  );
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const mailProvider = parseMailProvider(process.env.MAIL_PROVIDER);
// Cada key solo es obligatoria si el provider correspondiente está activo (fail-closed al boot).
const resendApiKey =
  mailProvider === "resend" ? requireEnv("RESEND_API_KEY") : undefined;
const brevoApiKey =
  mailProvider === "brevo" ? requireEnv("BREVO_API_KEY") : undefined;

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  databaseUrl: requireEnv("DATABASE_URL"),
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? "15m") as jwt.SignOptions["expiresIn"],
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",

  // ── Invitaciones por correo ──────────────────────────────
  // Vigencia del enlace de invitación (horas).
  invitacionTtlHoras: parsePositiveInt("INVITACION_TTL_HORAS", process.env.INVITACION_TTL_HORAS, 72),
  // "console" (default, sin red: loguea el enlace) | "resend" | "brevo" (HTTPS al proveedor).
  mailProvider,
  resendApiKey,
  brevoApiKey,
  mailFrom: process.env.MAIL_FROM || "onboarding@resend.dev",
  // Límites por ventana de 15 min (configurables para evitar 429 en tests).
  rateLimitInviteMax: parsePositiveInt("RATE_LIMIT_INVITE_MAX", process.env.RATE_LIMIT_INVITE_MAX, 30),
  rateLimitTokenMax: parsePositiveInt("RATE_LIMIT_TOKEN_MAX", process.env.RATE_LIMIT_TOKEN_MAX, 30),

  // ── GetStream ────────────────────────────────────────────
  // La API key viaja al cliente en la respuesta de /stream-token; el secret
  // nunca sale del servidor.
  getstreamApiKey: requireEnv("GETSTREAM_API_KEY"),
  getstreamApiSecret: requireEnv("GETSTREAM_API_SECRET"),
  // Vigencia del token de GetStream y del guest JWT. Deben ir alineados:
  // el guest JWT es lo que permite pedir un token de Stream nuevo.
  streamTokenTtlSeconds: Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? 3600),
  participantTokenTtlSeconds: Number(
    process.env.PARTICIPANT_TOKEN_TTL_SECONDS ?? 7200,
  ),
  // Firma HMAC de los webhooks GetStream (fail-closed): requerida por
  // defecto solo en producción; en dev/test se puede forzar con
  // WEBHOOK_SIGNATURE_REQUIRED=true|1|false|0 (valores no canónicos → error al boot).
  webhookSignatureRequired:
    parseBool("WEBHOOK_SIGNATURE_REQUIRED", process.env.WEBHOOK_SIGNATURE_REQUIRED) ??
    nodeEnv !== "development",
};
