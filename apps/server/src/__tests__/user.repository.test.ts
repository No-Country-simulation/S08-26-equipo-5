import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  usuario: { findFirst: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({ prisma: prismaMock }));

import { PrismaUserRepository } from "../repositories/user.repository.js";

const fila = {
  id: "u-1",
  nombre: "Ana",
  apellido: "Pérez",
  email: "Ana@Test.com",
  passwordHash: "hash",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("PrismaUserRepository.findByEmailInsensitive", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca sin distinguir mayúsculas (register no normaliza el email) y recorta espacios", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(fila);
    const repo = new PrismaUserRepository();

    const user = await repo.findByEmailInsensitive("  ana@test.com ");

    expect(prismaMock.usuario.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "ana@test.com", mode: "insensitive" } },
    });
    expect(user).toMatchObject({ id: "u-1", nombre: "Ana", apellido: "Pérez", email: "Ana@Test.com" });
  });

  it("devuelve null cuando no existe la cuenta", async () => {
    prismaMock.usuario.findFirst.mockResolvedValue(null);
    const repo = new PrismaUserRepository();

    expect(await repo.findByEmailInsensitive("nadie@test.com")).toBeNull();
  });
});
