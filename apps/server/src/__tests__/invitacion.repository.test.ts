import { vi } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
    INVITADO: "INVITADO",
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
}));

import { beforeEach, describe, expect, it, vi as vitest } from "vitest";
import { PrismaInvitacionRepository } from "../repositories/invitacion.repository.js";

function makePrisma() {
  const tx = {
    invitacion: { updateMany: vitest.fn() },
    participante: { updateMany: vitest.fn() },
  };
  const prisma = {
    participante: { create: vitest.fn() },
    invitacion: {
      update: vitest.fn(),
      findUnique: vitest.fn(),
    },
    // Transacción interactiva: ejecuta el callback con el tx fake.
    $transaction: vitest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma: prisma as any, tx };
}

const EXPIRA = new Date("2026-10-02T12:00:00.000Z");

describe("PrismaInvitacionRepository.crearInvitado", () => {
  it("crea Participante INVITADO + Invitacion en un único nested create (atómico)", async () => {
    const { prisma } = makePrisma();
    prisma.participante.create.mockResolvedValue({ id: "p-1" });
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.crearInvitado({
      salaId: "sala-1",
      email: "  Ana@Test.com ",
      usuarioId: null,
      nombre: null,
      apellido: null,
      tokenHash: "hash-1",
      expiresAt: EXPIRA,
      invitadoPorId: "host-1",
    });

    expect(result).toEqual({ id: "p-1" });
    expect(prisma.participante.create).toHaveBeenCalledTimes(1);
    expect(prisma.participante.create).toHaveBeenCalledWith({
      data: {
        salaId: "sala-1",
        email: "ana@test.com",
        usuarioId: null,
        nombre: null,
        apellido: null,
        rol: "PARTICIPANTE",
        estado: "INVITADO",
        invitacion: {
          create: {
            tokenHash: "hash-1",
            expiresAt: EXPIRA,
            invitadoPorId: "host-1",
          },
        },
      },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("copia nombre/apellido/usuarioId de la cuenta cuando el email está registrado", async () => {
    const { prisma } = makePrisma();
    prisma.participante.create.mockResolvedValue({ id: "p-2" });
    const repo = new PrismaInvitacionRepository(prisma);

    await repo.crearInvitado({
      salaId: "sala-1",
      email: "luis@test.com",
      usuarioId: "u-9",
      nombre: "Luis",
      apellido: "Gómez",
      tokenHash: "hash-2",
      expiresAt: EXPIRA,
      invitadoPorId: "host-1",
    });

    expect(prisma.participante.create.mock.calls[0][0].data).toMatchObject({
      usuarioId: "u-9",
      nombre: "Luis",
      apellido: "Gómez",
    });
  });

  it("mapea la violación de unique (P2002) a 409 ALREADY_PARTICIPANT", async () => {
    const { prisma } = makePrisma();
    prisma.participante.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    const repo = new PrismaInvitacionRepository(prisma);

    await expect(
      repo.crearInvitado({
        salaId: "sala-1",
        email: "ana@test.com",
        usuarioId: null,
        nombre: null,
        apellido: null,
        tokenHash: "h",
        expiresAt: EXPIRA,
        invitadoPorId: "host-1",
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_PARTICIPANT" });
  });
});

describe("PrismaInvitacionRepository.rotarToken", () => {
  it("reemplaza el hash, renueva expiresAt y limpia usedAt de la invitación del participante", async () => {
    const { prisma } = makePrisma();
    prisma.invitacion.update.mockResolvedValue({ id: "i-1" });
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.rotarToken({
      participanteId: "p-1",
      tokenHash: "hash-nuevo",
      expiresAt: EXPIRA,
      invitadoPorId: "host-2",
    });

    expect(result).toEqual({ id: "i-1" });
    expect(prisma.invitacion.update).toHaveBeenCalledWith({
      where: { participanteId: "p-1" },
      data: {
        tokenHash: "hash-nuevo",
        expiresAt: EXPIRA,
        usedAt: null,
        invitadoPorId: "host-2",
      },
    });
  });
});

describe("PrismaInvitacionRepository.findByTokenHash", () => {
  it("busca por hash e incluye participante con sala", async () => {
    const { prisma } = makePrisma();
    const fila = { id: "i-1", participante: { id: "p-1", sala: { id: "sala-1" } } };
    prisma.invitacion.findUnique.mockResolvedValue(fila);
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.findByTokenHash("hash-x");

    expect(result).toBe(fila);
    const arg = prisma.invitacion.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ tokenHash: "hash-x" });
    expect(arg.include.participante.include.sala).toBeTruthy();
  });

  it("devuelve null si el hash no existe", async () => {
    const { prisma } = makePrisma();
    prisma.invitacion.findUnique.mockResolvedValue(null);
    const repo = new PrismaInvitacionRepository(prisma);

    expect(await repo.findByTokenHash("desconocido")).toBeNull();
  });
});

describe("PrismaInvitacionRepository.consumirYActivar", () => {
  beforeEach(() => vitest.useFakeTimers().setSystemTime(new Date("2026-09-29T12:00:00.000Z")));

  it("consume la invitación (usedAt null y no vencida) y promueve INVITADO → PENDIENTE guardando nombre/apellido", async () => {
    const { prisma, tx } = makePrisma();
    tx.invitacion.updateMany.mockResolvedValue({ count: 1 });
    tx.participante.updateMany.mockResolvedValue({ count: 1 });
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.consumirYActivar({
      invitacionId: "i-1",
      participanteId: "p-1",
      nombre: "Ana",
      apellido: "Pérez",
    });

    expect(result).toEqual({ invitacionConsumida: true, participanteActivado: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.invitacion.updateMany).toHaveBeenCalledWith({
      where: { id: "i-1", usedAt: null, expiresAt: { gt: new Date("2026-09-29T12:00:00.000Z") } },
      data: { usedAt: new Date("2026-09-29T12:00:00.000Z") },
    });
    expect(tx.participante.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE", nombre: "Ana", apellido: "Pérez" },
    });
  });

  it("si la invitación ya no es consumible (count 0) no toca al participante", async () => {
    const { prisma, tx } = makePrisma();
    tx.invitacion.updateMany.mockResolvedValue({ count: 0 });
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.consumirYActivar({
      invitacionId: "i-1",
      participanteId: "p-1",
      nombre: "Ana",
      apellido: "Pérez",
    });

    expect(result).toEqual({ invitacionConsumida: false, participanteActivado: false });
    expect(tx.participante.updateMany).not.toHaveBeenCalled();
  });

  it("W2: si el participante ya no estaba INVITADO (count 0) revierte la transacción (no quema el token) y devuelve no-consumida", async () => {
    const { prisma, tx } = makePrisma();
    tx.invitacion.updateMany.mockResolvedValue({ count: 1 });
    tx.participante.updateMany.mockResolvedValue({ count: 0 });
    let callbackRechazo: unknown;
    prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => {
      try {
        return await fn(tx);
      } catch (e) {
        callbackRechazo = e; // Prisma haría rollback ante este rechazo
        throw e;
      }
    });
    const repo = new PrismaInvitacionRepository(prisma);

    const result = await repo.consumirYActivar({
      invitacionId: "i-1",
      participanteId: "p-1",
      nombre: "Ana",
      apellido: "Pérez",
    });

    expect(callbackRechazo).toBeInstanceOf(Error);
    expect(result).toEqual({ invitacionConsumida: false, participanteActivado: false });
  });

  it("errores inesperados de la transacción se propagan", async () => {
    const { prisma, tx } = makePrisma();
    tx.invitacion.updateMany.mockResolvedValue({ count: 1 });
    tx.participante.updateMany.mockRejectedValue(new Error("db caída"));
    const repo = new PrismaInvitacionRepository(prisma);

    await expect(repo.consumirYActivar({ invitacionId: "i-1", participanteId: "p-1" })).rejects.toThrow("db caída");
  });

  it("sin nombre/apellido (usuario registrado) no los incluye en el update", async () => {
    const { prisma, tx } = makePrisma();
    tx.invitacion.updateMany.mockResolvedValue({ count: 1 });
    tx.participante.updateMany.mockResolvedValue({ count: 1 });
    const repo = new PrismaInvitacionRepository(prisma);

    await repo.consumirYActivar({ invitacionId: "i-1", participanteId: "p-1" });

    expect(tx.participante.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE" },
    });
  });
});
