import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // ─── AppError (nuevo patrón de develop) ──────────────────
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { errors: err.details } : {}),
      },
    });
  }

  // ─── Legacy errors (ValidationError, NotFoundError, etc.) ──
  if (err instanceof Error && "statusCode" in err) {
    const legacyErr = err as Error & { statusCode: number };
    return res.status(legacyErr.statusCode).json({
      error: legacyErr.message,
    });
  }

  console.error("[UnhandledError]", err);

  return res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "Ocurrió un error interno" },
  });
}
