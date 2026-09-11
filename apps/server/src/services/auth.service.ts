import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { IRefreshTokenRepository } from "../repositories/refreshToken.repository.js";
import type { JwtPayload, LoginDto, RegisterDto } from "../types/auth.types.js";
import { AppError } from "../utils/AppError.js";
import { generateRefreshToken, hashRefreshToken } from "../utils/refreshToken.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  private signAccessToken(user: { id: string; email: string }): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  }

  private async issueRefreshToken(usuarioId: string, familyId: string): Promise<string> {
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * MS_PER_DAY);

    await this.refreshTokenRepository.create({
      tokenHash: hashRefreshToken(token),
      usuarioId,
      familyId,
      expiresAt,
    });

    return token;
  }

  async register(data: RegisterDto) {
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "El email ya está registrado");
    }

    const passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);

    const user = await this.userRepository.create({
      nombre: data.nombre,
      apellido: data.apellido,
      email: data.email,
      passwordHash,
    });

    return { message: "Usuario registrado exitosamente", userId: user.id };
  }

  async login(data: LoginDto) {
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
    }

    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordMatch) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email o contraseña incorrectos");
    }

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id, crypto.randomUUID());

    return { accessToken, refreshToken };
  }

  async refresh(token: string) {
    const invalid = () =>
      new AppError(401, "INVALID_REFRESH_TOKEN", "El refresh token es inválido o expiró");

    const record = await this.refreshTokenRepository.findByHash(hashRefreshToken(token));
    if (!record) {
      throw invalid();
    }

    const now = new Date();

    if (record.revokedAt) {
      await this.refreshTokenRepository.revokeFamily(record.familyId, now);
      throw invalid();
    }

    if (record.expiresAt <= now) {
      throw invalid();
    }

    const user = await this.userRepository.findById(record.usuarioId);
    if (!user) {
      throw invalid();
    }

    await this.refreshTokenRepository.revoke(record.id, now);

    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.issueRefreshToken(user.id, record.familyId);

    return { accessToken, refreshToken };
  }

  async logout(token: string) {
    const record = await this.refreshTokenRepository.findByHash(hashRefreshToken(token));

    if (record && !record.revokedAt) {
      await this.refreshTokenRepository.revoke(record.id, new Date());
    }
  }
}
