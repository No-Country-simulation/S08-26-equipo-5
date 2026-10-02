import type { NextFunction, Request, Response } from "express";
import { AppError, type AppErrorDetail } from "../utils/AppError.js";

interface ValidationRule {
  field: string;
  required?: boolean;
  email?: boolean;
  minLength?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBody(rules: ValidationRule[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const errors: AppErrorDetail[] = [];

    for (const rule of rules) {
      const value = req.body?.[rule.field];

      if (value === undefined || value === null || value === "") {
        if (rule.required) {
          errors.push({ campo: rule.field, mensaje: `El campo '${rule.field}' es requerido` });
        }
        continue;
      }

      if (typeof value !== "string") {
        errors.push({ campo: rule.field, mensaje: `El campo '${rule.field}' debe ser texto` });
        continue;
      }

      if (rule.email && !EMAIL_REGEX.test(value)) {
        errors.push({ campo: rule.field, mensaje: "Debe ser un email válido" });
      }

      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({
          campo: rule.field,
          mensaje: `Debe tener al menos ${rule.minLength} caracteres`,
        });
      }
    }

    if (errors.length > 0) {
      return next(
        new AppError(400, "VALIDATION_ERROR", "La solicitud contiene datos inválidos", errors),
      );
    }

    next();
  };
}
