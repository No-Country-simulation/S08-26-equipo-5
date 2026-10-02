import type { Usuario } from "@prisma/client";

export interface User {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string;
  /** URL pública de la foto de perfil (null si no subió ninguna). */
  fotoUrl: string | null;
  /** Identificador en el proveedor de imágenes; uso interno, no se expone. */
  fotoPublicId: string | null;
}

export function toUser(usuario: Usuario): User {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    passwordHash: usuario.passwordHash,
    fotoUrl: usuario.fotoUrl,
    fotoPublicId: usuario.fotoPublicId,
  };
}