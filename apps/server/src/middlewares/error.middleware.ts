import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { errors: err.details } : {}),
      },
    });
  }

  console.error("[UnhandledError]", err);

  return res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "Ocurrió un error interno" },
  });
}
