import type { Request, Response, NextFunction } from "express";
import {
  ValidationError,
  NotFoundError,
  StreamServiceError,
} from "../errors/index.js";

/**
 * Middleware centralizado de manejo de errores.
 * Intercepta errores customizados y retorna JSON con status code y mensaje.
 * Errores desconocidos se mapean a 500 Internal Server Error.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof StreamServiceError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
}
