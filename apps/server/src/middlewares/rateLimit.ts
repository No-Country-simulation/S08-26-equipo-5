import type { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

interface LimiterOptions {
  /** Requests por ventana de 15 min. */
  max: number;
  /** true → no limita (tests: evita 429 espurios en supertest). */
  skip: boolean;
  /** Clave del contador; por defecto usuario autenticado o IP. */
  keyGenerator?: (req: Request) => string;
}

/**
 * Limiter con el formato de error de la API (AppError → errorMiddleware).
 * Clave: usuario autenticado si lo hay (rutas detrás de verifyToken), si no IP.
 */
export function createLimiter({ max, skip, keyGenerator }: LimiterOptions) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => skip,
    keyGenerator:
      keyGenerator ??
      ((req: Request) => req.user?.sub ?? ipKeyGenerator(req.ip ?? "unknown")),
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new AppError(429, "RATE_LIMITED", "Demasiadas solicitudes, intentá más tarde"));
    },
  });
}

const enTest = env.nodeEnv === "test";

/** POST /salas/:id/invitaciones (debe ir DESPUÉS de verifyToken para clavear por host). */
export const inviteLimiter = createLimiter({ max: env.rateLimitInviteMax, skip: enTest });

/** Endpoints públicos con token de invitación (clave por IP). */
export const tokenLimiter = createLimiter({ max: env.rateLimitTokenMax, skip: enTest });

/** Clave por IP (IPv6 agrupado por /56), ignorando al usuario autenticado. */
function ipKey(req: Request): string {
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

/** Clave por email del body, normalizado; sin email válido cae a la IP. */
function emailKey(req: Request): string {
  const email = req.body?.email;
  return typeof email === "string" && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : ipKey(req);
}

/** POST /auth/forgot-password por IP: frena el envío masivo de correos. */
export const forgotIpLimiter = createLimiter({
  max: env.rateLimitForgotMax,
  skip: enTest,
  keyGenerator: ipKey,
});

/** POST /auth/forgot-password por email (va después de validar el body): evita inundar un buzón. */
export const forgotEmailLimiter = createLimiter({
  max: env.rateLimitForgotMax,
  skip: enTest,
  keyGenerator: emailKey,
});

/**
 * GET/POST /auth/reset-password/:token por IP. Instancia propia (no comparte
 * contador con `tokenLimiter` de invitaciones) contra fuerza bruta de tokens.
 */
export const resetTokenLimiter = createLimiter({
  max: env.rateLimitTokenMax,
  skip: enTest,
  keyGenerator: ipKey,
});
