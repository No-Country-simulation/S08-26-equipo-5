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

describe("PrismaParticipanteRepository.activarInvitado", () => {
  it("promueve INVITADO → PENDIENTE con update condicional y guarda nombre/apellido", async () => {
    const updateMany = vitest.fn().mockResolvedValue({ count: 1 });
    const repo = new PrismaParticipanteRepository({ participante: { updateMany } } as any);

    const count = await repo.activarInvitado("p-1", { nombre: "Ana", apellido: "Pérez" });

    expect(count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE", nombre: "Ana", apellido: "Pérez" },
    });
  });

  it("sin datos solo cambia el estado (no pisa nombre/apellido existentes)", async () => {
    const updateMany = vitest.fn().mockResolvedValue({ count: 1 });
    const repo = new PrismaParticipanteRepository({ participante: { updateMany } } as any);

    await repo.activarInvitado("p-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", estado: "INVITADO" },
      data: { estado: "PENDIENTE" },
    });
  });

  it("devuelve 0 si el participante ya no estaba INVITADO (carrera perdida)", async () => {
    const updateMany = vitest.fn().mockResolvedValue({ count: 0 });
    const repo = new PrismaParticipanteRepository({ participante: { updateMany } } as any);

    expect(await repo.activarInvitado("p-1", { nombre: "Ana", apellido: "Pérez" })).toBe(0);
  });
});
