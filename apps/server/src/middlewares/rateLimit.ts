import type { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

interface LimiterOptions {
  /** Requests por ventana de 15 min. */
  max: number;
  /** true → no limita (tests: evita 429 espurios en supertest). */
  skip: boolean;
}

/**
 * Limiter con el formato de error de la API (AppError → errorMiddleware).
 * Clave: usuario autenticado si lo hay (rutas detrás de verifyToken), si no IP.
 */
export function createLimiter({ max, skip }: LimiterOptions) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => skip,
    keyGenerator: (req: Request) =>
      req.user?.sub ?? ipKeyGenerator(req.ip ?? "unknown"),
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
