import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

interface ValidationRule {
  field: string;
  required?: boolean;
  email?: boolean;
  minLength?: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBody(rules: ValidationRule[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const missing = rules
      .filter((rule) => rule.required && req.body?.[rule.field] === undefined)
      .map((rule) => rule.field);

    if (missing.length > 0) {
      return next(
        new AppError(400, "VALIDATION_ERROR", `Missing required fields: ${missing.join(", ")}`),
      );
    }

    for (const rule of rules) {
      const value = req.body?.[rule.field];
      if (value === undefined) continue;

      if (typeof value !== "string") {
        return next(
          new AppError(400, "VALIDATION_ERROR", `Field '${rule.field}' must be a string`),
        );
      }

      if (rule.email && !EMAIL_REGEX.test(value)) {
        return next(
          new AppError(400, "VALIDATION_ERROR", `Field '${rule.field}' must be a valid email`),
        );
      }

      if (rule.minLength !== undefined && value.length < rule.minLength) {
        return next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            `Field '${rule.field}' must be at least ${rule.minLength} characters`,
          ),
        );
      }
    }

    next();
  };
}