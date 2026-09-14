import { prisma } from "../config/prisma.js";
import type { User } from "../models/user.model.js";
import { toUser } from "../models/user.model.js";

export interface CreateUserData {
  nombre: string;
  apellido: string;
  email: string;
  passwordHash: string;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
}

export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<User | null> {
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    return usuario ? toUser(usuario) : null;
  }

  async findById(id: string): Promise<User | null> {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    return usuario ? toUser(usuario) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const usuario = await prisma.usuario.create({ data });
    return toUser(usuario);
  }
}