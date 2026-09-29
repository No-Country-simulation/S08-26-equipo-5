import type { Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { getMailer } from "../mail/index.js";
import { PrismaInvitacionRepository } from "../repositories/invitacion.repository.js";
import { PrismaParticipanteRepository } from "../repositories/participante.repository.js";
import { PrismaSalaRepository } from "../repositories/sala.repository.js";
import { PrismaUserRepository } from "../repositories/user.repository.js";
import {
  invitar,
  previewInvitacion,
  type InvitacionDeps,
} from "../services/invitacion.service.js";
import { AppError } from "../utils/AppError.js";

const deps: InvitacionDeps = {
  participantes: new PrismaParticipanteRepository(prisma),
  invitaciones: new PrismaInvitacionRepository(prisma),
  salas: new PrismaSalaRepository(prisma),
  usuarios: new PrismaUserRepository(),
  // Lazy: el provider se resuelve en el primer envío, no al importar el módulo.
  mailer: { send: (message) => getMailer().send(message) },
};

// ─── POST /salas/:id/invitaciones — invitar por correo (solo HOST) ──

/**
 * Requiere: Authorization: Bearer <jwt> del host de la sala.
 * Body: { emails: string[] } (1..20). Respuesta uniforme por email: nunca
 * revela si el email tiene cuenta.
 */
export async function invitarASala(
  req: Request<{ id: string }, unknown, { emails?: unknown }>,
  res: Response,
): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError(401, "UNAUTHORIZED", "Token ausente, inválido o expirado");
  }

  const data = await invitar(deps, {
    salaId: req.params.id,
    hostUserId: userId,
    emails: req.body?.emails,
  });

  res.status(200).json({ data });
}

// ─── GET /invitaciones/:token — vista previa pública (no consume) ──

export async function getInvitacion(
  req: Request<{ token: string }>,
  res: Response,
): Promise<void> {
  const data = await previewInvitacion(deps, req.params.token);
  res.status(200).json({ data });
}
