import { prisma } from "../config/prisma.js";

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  usuarioId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateRefreshTokenData {
  tokenHash: string;
  usuarioId: string;
  familyId: string;
  expiresAt: Date;
}

export interface IRefreshTokenRepository {
  create(data: CreateRefreshTokenData): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string, revokedAt: Date): Promise<void>;
  revokeFamily(familyId: string, revokedAt: Date): Promise<void>;
}

export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  async create(data: CreateRefreshTokenData): Promise<RefreshTokenRecord> {
    return prisma.refreshToken.create({ data });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    await prisma.refreshToken.update({ where: { id }, data: { revokedAt } });
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
