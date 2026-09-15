import type { Usuario } from "@prisma/client";

export interface User {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string;
}

export function toUser(usuario: Usuario): User {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    passwordHash: usuario.passwordHash,
  };
}