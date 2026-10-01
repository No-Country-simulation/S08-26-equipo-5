import { AppError } from "./AppError.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rechaza un id de ruta antes de que Prisma intente castear un no-UUID. */
export function assertUuid(value: string, campo = "id"): void {
  if (!UUID_RE.test(value)) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      `El campo '${campo}' debe ser un UUID`,
    );
  }
}
