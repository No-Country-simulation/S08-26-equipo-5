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

// TRUST_PROXY (Express "trust proxy"): saltos de proxy ("1"), "true"/"false" o lista
// de IPs/subredes/alias separada por comas. Vacío → 1 salto en producción (detrás de
// nginx) y false en el resto. Se prefiere el número de saltos: "true" confía en
// cualquier X-Forwarded-For y express-rate-limit lo rechaza (ERR_ERL_PERMISSIVE_TRUST_PROXY).
function parseTrustProxy(value: string | undefined, nodeEnv: string): boolean | number | string {
  const v = value?.trim();
  if (v === undefined || v === "") return nodeEnv === "production" ? 1 : false;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(
        `Valor inválido para TRUST_PROXY: "${v}". Un número debe ser un entero positivo (saltos de proxy)`,
      );
    }
    return n;
  }
  return v.split(",").map((part) => part.trim()).filter(Boolean).join(",");
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
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, nodeEnv),

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

  // ── Recuperación de contraseña ───────────────────────────
  // Vigencia del enlace de restablecimiento (minutos).
  passwordResetTtlMinutes: parsePositiveInt(
    "PASSWORD_RESET_TTL_MINUTES",
    process.env.PASSWORD_RESET_TTL_MINUTES,
    30,
  ),
  // POST /auth/forgot-password por IP y por email, cada 15 min.
  rateLimitForgotMax: parsePositiveInt("RATE_LIMIT_FORGOT_MAX", process.env.RATE_LIMIT_FORGOT_MAX, 5),

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

  // ── Foto de perfil (Cloudinary) ──────────────────────────
  // OPCIONAL: sin CLOUDINARY_URL (cloudinary://key:secret@cloud_name) el
  // servidor arranca igual y los endpoints de foto responden 503
  // UPLOADS_NOT_CONFIGURED. Contiene el secret: nunca loguear.
  cloudinaryUrl: process.env.CLOUDINARY_URL || undefined,
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "meetflow/avatars",
  avatarMaxBytes: parsePositiveInt("AVATAR_MAX_BYTES", process.env.AVATAR_MAX_BYTES, 2 * 1024 * 1024),
  // Tope de subidas/borrados de foto por usuario cada 15 min.
  rateLimitAvatarMax: parsePositiveInt("RATE_LIMIT_AVATAR_MAX", process.env.RATE_LIMIT_AVATAR_MAX, 10),
};
