import type { PrismaClient } from "@prisma/client";

export interface CrearResetData {
  usuarioId: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}

export interface ResetValido {
  id: string;
  usuarioId: string;
  email: string;
  nombre: string;
}

export interface ConsumirResetData {
  tokenHash: string;
  /** Hash bcrypt ya calculado de la contraseña nueva. */
  passwordHash: string;
  now: Date;
}

export interface UsuarioReset {
  usuarioId: string;
  email: string;
  nombre: string;
}

export interface IPasswordResetRepository {
  /**
   * Invalida los pedidos pendientes del usuario y crea el nuevo, todo en una
   * transacción: nunca quedan dos enlaces vivos por una carrera.
   */
  crearReemplazando(data: CrearResetData): Promise<void>;
  /** Token sin usar y no vencido, con los datos del usuario; null en cualquier otro caso. */
  findValidoByTokenHash(tokenHash: string, now: Date): Promise<ResetValido | null>;
  /**
   * Unidad atómica del restablecimiento: consume el token (update condicional),
   * cambia el passwordHash y revoca TODOS los refresh tokens del usuario.
   * null: el token ya estaba usado/vencido (o perdió la carrera) y no se tocó nada.
   */
  consumirYCambiarPassword(data: ConsumirResetData): Promise<UsuarioReset | null>;
}

export class PrismaPasswordResetRepository implements IPasswordResetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async crearReemplazando(data: CrearResetData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({
        where: { usuarioId: data.usuarioId, usedAt: null },
        data: { usedAt: data.now },
      });
      await tx.passwordReset.create({
        data: {
          usuarioId: data.usuarioId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
    });
  }

  async findValidoByTokenHash(tokenHash: string, now: Date): Promise<ResetValido | null> {
    const reset = await this.prisma.passwordReset.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        usuarioId: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });
    if (!reset) return null;
    return {
      id: reset.id,
      usuarioId: reset.usuarioId,
      email: reset.usuario.email,
      nombre: reset.usuario.nombre,
    };
  }

  async consumirYCambiarPassword(data: ConsumirResetData): Promise<UsuarioReset | null> {
    return this.prisma.$transaction(async (tx) => {
      // El `count` del update condicional es la verdad ante usos concurrentes:
      // solo una transacción lo consume.
      const consumido = await tx.passwordReset.updateMany({
        where: { tokenHash: data.tokenHash, usedAt: null, expiresAt: { gt: data.now } },
        data: { usedAt: data.now },
      });
      if (consumido.count === 0) return null;

      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: data.tokenHash },
        select: { usuarioId: true, usuario: { select: { email: true, nombre: true } } },
      });
      if (!reset) return null;

      await tx.usuario.update({
        where: { id: reset.usuarioId },
        data: { passwordHash: data.passwordHash },
      });
      // Cerrar todas las sesiones (todas las familias): quien tuviera la cuenta
      // comprometida no conserva ningún refresh token.
      await tx.refreshToken.updateMany({
        where: { usuarioId: reset.usuarioId, revokedAt: null },
        data: { revokedAt: data.now },
      });
      // Otros enlaces pendientes del mismo usuario dejan de servir.
      await tx.passwordReset.updateMany({
        where: { usuarioId: reset.usuarioId, usedAt: null },
        data: { usedAt: data.now },
      });

      return {
        usuarioId: reset.usuarioId,
        email: reset.usuario.email,
        nombre: reset.usuario.nombre,
      };
    });
  }
}
