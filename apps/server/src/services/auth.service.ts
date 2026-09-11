import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { JwtPayload, LoginDto, RegisterDto } from "../types/auth.types.js";
import { AppError } from "../utils/AppError.js";

export class AuthService {
  constructor(private readonly userRepository: IUserRepository) {}

  async register(data: RegisterDto) {
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "Email already registered");
    }

    const passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);

    const user = await this.userRepository.create({
      nombre: data.nombre,
      apellido: data.apellido,
      email: data.email,
      passwordHash,
    });

    return { message: "User registered successfully", userId: user.id };
  }

  async login(data: LoginDto) {
    const user = await this.userRepository.findByEmail(data.email);
    if (!user) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const passwordMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!passwordMatch) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = jwt.sign(payload, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    });

    return { accessToken };
  }
}