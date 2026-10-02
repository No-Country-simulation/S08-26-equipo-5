import type { MeResponse } from "../types/auth.types.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import { AppError } from "../utils/AppError.js";

const MAX_LARGO = 100;

export class UsuarioPerfilService {
  constructor(private readonly users: Pick<IUserRepository, "updateDatos">) {}

  async updateNombre(
    userId: string,
    input: { nombre: unknown; apellido: unknown },
  ): Promise<MeResponse> {
    const nombre = texto(input.nombre, "nombre");
    const apellido = texto(input.apellido, "apellido");
    const user = await this.users.updateDatos(userId, { nombre, apellido });
    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    }
    return {
      id: user.id,
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      fotoUrl: user.fotoUrl ?? null,
    };
  }
}

function texto(value: unknown, campo: string): string {
  if (typeof value !== "string") {
    throw new AppError(400, "VALIDATION_ERROR", `El campo '${campo}' debe ser texto`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, "VALIDATION_ERROR", `El campo '${campo}' es requerido`);
  }
  if (trimmed.length > MAX_LARGO) {
    throw new AppError(400, "VALIDATION_ERROR", `El campo '${campo}' no puede superar ${MAX_LARGO} caracteres`);
  }
  return trimmed;
}
