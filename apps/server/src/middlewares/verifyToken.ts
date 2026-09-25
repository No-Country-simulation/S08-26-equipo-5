import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

/**
 * Igual que verifyToken pero no falla si no hay token.
 * Se usa en rutas públicas que, si el visitante está logueado, aprovechan
 * su identidad (por ejemplo, vincular el participante a su usuario).
 */
export function optionalVerifyToken(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(
        authHeader.slice("Bearer ".length),
        env.jwtSecret,
      ) as jwt.JwtPayload;

      if (typeof payload.sub === "string" && !payload.typ) {
        req.user = { sub: payload.sub, email: payload.email as string };
      }
    } catch {
      // Token inválido en una ruta pública: se ignora y sigue como anónimo.
    }
  }

  next();
}

export function verifyToken(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Token ausente, inválido o expirado"));
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    req.user = { sub: payload.sub as string, email: payload.email as string };
    next();
  } catch {
    return next(new AppError(401, "UNAUTHORIZED", "Token ausente, inválido o expirado"));
  }
}