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
