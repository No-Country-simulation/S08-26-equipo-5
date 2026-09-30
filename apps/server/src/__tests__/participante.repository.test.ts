import { vi } from "vitest";

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(),
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
  EstadoParticipante: {
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

describe("PrismaParticipanteRepository.findAprobadosBySala — fotoUrl", () => {
  it("aplana la foto de la cuenta vinculada y usa null para invitados", async () => {
    const findMany = vitest.fn().mockResolvedValue([
      { id: "p1", nombre: "Ana", estado: "APROBADO", usuario: { fotoUrl: "https://cdn/v1/ana.jpg" } },
      { id: "p2", nombre: "Luz", estado: "APROBADO", usuario: { fotoUrl: null } },
      { id: "p3", nombre: "Invitado", estado: "APROBADO", usuario: null },
    ]);
    const repo = new PrismaParticipanteRepository({ participante: { findMany } } as any);

    const out = await repo.findAprobadosBySala("sala-1");

    expect(out).toEqual([
      { id: "p1", nombre: "Ana", estado: "APROBADO", fotoUrl: "https://cdn/v1/ana.jpg" },
      { id: "p2", nombre: "Luz", estado: "APROBADO", fotoUrl: null },
      { id: "p3", nombre: "Invitado", estado: "APROBADO", fotoUrl: null },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ usuario: { select: { fotoUrl: true } } }),
      }),
    );
  });
});
