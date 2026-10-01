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

import { describe, it, expect, vi as vitest } from "vitest";
import { PrismaParticipanteRepository } from "../repositories/participante.repository.js";

function makePrisma(createImpl: () => Promise<unknown>) {
  return {
    participante: {
      create: vitest.fn(createImpl),
    },
  } as any;
}

describe("PrismaParticipanteRepository.createPendiente — P2002", () => {
  it("mapea una violación de unique constraint (salaId, usuarioId) a 409 ALREADY_PARTICIPANT", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed on the fields: (`salaId`,`usuarioId`)"), {
      code: "P2002",
    });
    const prisma = makePrisma(() => Promise.reject(p2002));
    const repo = new PrismaParticipanteRepository(prisma);

    await expect(
      repo.createPendiente({
        salaId: "sala-1",
        usuarioId: "usuario-1",
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@test.com",
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_PARTICIPANT" });
  });

  it("deja pasar cualquier otro error sin tocarlo", async () => {
    const otro = new Error("DB caída");
    const prisma = makePrisma(() => Promise.reject(otro));
    const repo = new PrismaParticipanteRepository(prisma);

    await expect(
      repo.createPendiente({
        salaId: "sala-1",
        usuarioId: null,
        nombre: "Ana",
        apellido: "Pérez",
        email: "ana@test.com",
      }),
    ).rejects.toBe(otro);
  });
});

describe("PrismaParticipanteRepository.findByEmail", () => {
  it("busca por (sala, email) sin distinguir mayúsculas y recortando espacios", async () => {
    const fila = { id: "p-1", estado: "INVITADO" };
    const findFirst = vitest.fn().mockResolvedValue(fila);
    const repo = new PrismaParticipanteRepository({ participante: { findFirst } } as any);

    const result = await repo.findByEmail("sala-1", "  Ana@Test.com ");

    expect(result).toBe(fila);
    expect(findFirst).toHaveBeenCalledWith({
      where: { salaId: "sala-1", email: { equals: "Ana@Test.com", mode: "insensitive" } },
    });
  });

  it("devuelve null si no hay coincidencia", async () => {
    const findFirst = vitest.fn().mockResolvedValue(null);
    const repo = new PrismaParticipanteRepository({ participante: { findFirst } } as any);

    expect(await repo.findByEmail("sala-1", "nadie@test.com")).toBeNull();
  });
});

function makeTxPrisma(participanteCount: number) {
  const participanteUpdateMany = vitest.fn().mockResolvedValue({ count: participanteCount });
  const invitacionUpdateMany = vitest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    participante: { updateMany: participanteUpdateMany },
    invitacion: { updateMany: invitacionUpdateMany },
  };
  const prisma = { $transaction: vitest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) } as any;
  return { prisma, participanteUpdateMany, invitacionUpdateMany };
}

describe("PrismaParticipanteRepository.activarInvitado", () => {
  it("promueve INVITADO → PENDIENTE con update condicional, guarda nombre/apellido y marca usada la invitacion", async () => {
    const { prisma, participanteUpdateMany, invitacionUpdateMany } = makeTxPrisma(1);
    const repo = new PrismaParticipanteRepository(prisma);

    const count = await repo.activarInvitado("p-1", { nombre: "Ana", apellido: "Pérez" });

    expect(count).toBe(1);
    expect(participanteUpdateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE", nombre: "Ana", apellido: "Pérez" },
    });
    expect(invitacionUpdateMany).toHaveBeenCalledWith({
      where: { participanteId: "p-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it("sin datos solo cambia el estado (no pisa nombre/apellido existentes)", async () => {
    const { prisma, participanteUpdateMany } = makeTxPrisma(1);
    const repo = new PrismaParticipanteRepository(prisma);

    await repo.activarInvitado("p-1");

    expect(participanteUpdateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE" },
    });
  });

  it("devuelve 0 y no toca la invitacion si el participante ya no estaba INVITADO (carrera perdida)", async () => {
    const { prisma, invitacionUpdateMany } = makeTxPrisma(0);
    const repo = new PrismaParticipanteRepository(prisma);

    expect(await repo.activarInvitado("p-1", { nombre: "Ana", apellido: "Pérez" })).toBe(0);
    expect(invitacionUpdateMany).not.toHaveBeenCalled();
  });
});
