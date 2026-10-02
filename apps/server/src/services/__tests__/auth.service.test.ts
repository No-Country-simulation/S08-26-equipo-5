import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/env.js", () => ({
  env: {
    jwtSecret: "test-jwt-secret",
    jwtExpiresIn: "15m",
    refreshTokenTtlDays: 7,
    bcryptSaltRounds: 4,
  },
}));

import { AuthService } from "../auth.service.js";
import type { IUserRepository } from "../../repositories/user.repository.js";
import type { IRefreshTokenRepository } from "../../repositories/refreshToken.repository.js";

function buildService(user: Record<string, unknown> | null) {
  const users = {
    findById: vi.fn().mockResolvedValue(user),
  } as unknown as IUserRepository;
  const tokens = {} as IRefreshTokenRepository;
  return new AuthService(users, tokens);
}

const base = {
  id: "u1",
  nombre: "Ana",
  apellido: "Pérez",
  email: "ana@test.com",
  passwordHash: "hash",
};

describe("AuthService.me", () => {
  it("incluye fotoUrl cuando el usuario tiene foto", async () => {
    const svc = buildService({
      ...base,
      fotoUrl: "https://res.cloudinary.com/x/image/upload/v1/a.jpg",
      fotoPublicId: "meetflow/avatars/u1",
    });
    const me = await svc.me("u1");
    expect(me).toEqual({
      id: "u1",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@test.com",
      fotoUrl: "https://res.cloudinary.com/x/image/upload/v1/a.jpg",
    });
    // nunca se filtra el publicId ni el hash
    expect(me).not.toHaveProperty("fotoPublicId");
    expect(me).not.toHaveProperty("passwordHash");
  });

  it("devuelve fotoUrl null cuando no hay foto", async () => {
    const svc = buildService({ ...base, fotoUrl: null, fotoPublicId: null });
    const me = await svc.me("u1");
    expect(me.fotoUrl).toBeNull();
  });
});
