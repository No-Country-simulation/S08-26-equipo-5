import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPasswordResetRepository } from "../repositories/passwordReset.repository.js";

const AHORA = new Date("2026-10-02T12:00:00.000Z");
const EXPIRA = new Date("2026-10-02T12:30:00.000Z");

function makePrisma() {
  const tx = {
    passwordReset: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    usuario: { update: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
  };
  const prisma = {
    passwordReset: { findFirst: vi.fn() },
    // Transacción interactiva: ejecuta el callback con el tx fake.
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma: prisma as any, tx };
}

describe("PrismaPasswordResetRepository.crearReemplazando", () => {
  it("en una transacción invalida los pendientes del usuario y crea el nuevo", async () => {
    const { prisma, tx } = makePrisma();
    const repo = new PrismaPasswordResetRepository(prisma);

    await repo.crearReemplazando({
      usuarioId: "u1",
      tokenHash: "hash-1",
      expiresAt: EXPIRA,
      now: AHORA,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.passwordReset.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1", usedAt: null },
      data: { usedAt: AHORA },
    });
    expect(tx.passwordReset.create).toHaveBeenCalledWith({
      data: { usuarioId: "u1", tokenHash: "hash-1", expiresAt: EXPIRA },
    });
  });
});

describe("PrismaPasswordResetRepository.findValidoByTokenHash", () => {
  it("busca solo tokens sin usar y no vencidos, con el email y nombre del usuario", async () => {
    const { prisma } = makePrisma();
    prisma.passwordReset.findFirst.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      usuario: { email: "ana@x.com", nombre: "Ana" },
    });
    const repo = new PrismaPasswordResetRepository(prisma);

    const res = await repo.findValidoByTokenHash("hash-1", AHORA);

    expect(prisma.passwordReset.findFirst).toHaveBeenCalledWith({
      where: { tokenHash: "hash-1", usedAt: null, expiresAt: { gt: AHORA } },
      select: {
        id: true,
        usuarioId: true,
        usuario: { select: { email: true, nombre: true } },
      },
    });
    expect(res).toEqual({ id: "r1", usuarioId: "u1", email: "ana@x.com", nombre: "Ana" });
  });

  it("devuelve null si no hay token válido", async () => {
    const { prisma } = makePrisma();
    prisma.passwordReset.findFirst.mockResolvedValue(null);
    const repo = new PrismaPasswordResetRepository(prisma);

    expect(await repo.findValidoByTokenHash("x", AHORA)).toBeNull();
  });
});

describe("PrismaPasswordResetRepository.consumirYCambiarPassword", () => {
  let m: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    m = makePrisma();
    m.tx.passwordReset.updateMany.mockResolvedValue({ count: 1 });
    m.tx.passwordReset.findUnique.mockResolvedValue({
      usuarioId: "u1",
      usuario: { email: "ana@x.com", nombre: "Ana" },
    });
    m.tx.usuario.update.mockResolvedValue({});
    m.tx.refreshToken.updateMany.mockResolvedValue({ count: 3 });
  });

  it("consume el token (condicional), cambia el hash y revoca TODAS las sesiones en una transacción", async () => {
    const repo = new PrismaPasswordResetRepository(m.prisma);

    const res = await repo.consumirYCambiarPassword({
      tokenHash: "hash-1",
      passwordHash: "bcrypt-hash",
      now: AHORA,
    });

    expect(m.prisma.$transaction).toHaveBeenCalledTimes(1);
    // El primer paso es el consumo atómico: usedAt null y no vencido.
    expect(m.tx.passwordReset.updateMany).toHaveBeenNthCalledWith(1, {
      where: { tokenHash: "hash-1", usedAt: null, expiresAt: { gt: AHORA } },
      data: { usedAt: AHORA },
    });
    expect(m.tx.usuario.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "bcrypt-hash" },
    });
    // Todas las familias del usuario, no una sola.
    expect(m.tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { usuarioId: "u1", revokedAt: null },
      data: { revokedAt: AHORA },
    });
    // Otros enlaces pendientes del mismo usuario quedan inválidos.
    expect(m.tx.passwordReset.updateMany).toHaveBeenNthCalledWith(2, {
      where: { usuarioId: "u1", usedAt: null },
      data: { usedAt: AHORA },
    });
    expect(res).toEqual({ usuarioId: "u1", email: "ana@x.com", nombre: "Ana" });
  });

  it("si el consumo no afectó filas (usado, vencido o carrera perdida) devuelve null y no toca nada más", async () => {
    m.tx.passwordReset.updateMany.mockResolvedValue({ count: 0 });
    const repo = new PrismaPasswordResetRepository(m.prisma);

    const res = await repo.consumirYCambiarPassword({
      tokenHash: "hash-1",
      passwordHash: "bcrypt-hash",
      now: AHORA,
    });

    expect(res).toBeNull();
    expect(m.tx.usuario.update).not.toHaveBeenCalled();
    expect(m.tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
