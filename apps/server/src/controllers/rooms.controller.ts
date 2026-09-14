import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { ValidationError, NotFoundError, StreamServiceError } from "../errors/index.js";
import { createRoom as createRoomService, generateToken as generateTokenService } from "../services/stream.service.js";
import type { CreateRoomBody, GenerateTokenBody } from "../types/stream.js";

const prisma = new PrismaClient();

/**
 * POST /rooms — Crea una sala en GetStream y la persiste en Prisma.
 */
export async function createRoom(
  req: Request<unknown, unknown, CreateRoomBody>,
  res: Response
): Promise<void> {
  const { name, userId } = req.body;

  // ── Validación ──────────────────────────────────────────
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    throw new ValidationError("El campo 'name' es requerido y no puede estar vacío");
  }

  if (name.length > 100) {
    throw new ValidationError("El campo 'name' no puede exceder 100 caracteres");
  }

  // ── Crear sala en GetStream ─────────────────────────────
  const { streamRoomId } = await createRoomService(name.trim(), userId);

  // ── Persistir en Prisma ─────────────────────────────────
  try {
    const sala = await prisma.sala.create({
      data: {
        nombre: name.trim(),
        codigo: streamRoomId.split(":").pop() ?? streamRoomId,
        fechaInicio: new Date(),
        estado: "PROGRAMADA",
        streamRoomId,
      },
    });

    res.status(201).json({
      salaId: sala.id,
      streamRoomId,
      name: sala.nombre,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al persistir sala";
    throw new StreamServiceError(`Error al guardar sala en base de datos: ${message}`);
  }
}

/**
 * POST /rooms/:id/token — Genera un token GetStream para un participante.
 */
export async function generateToken(
  req: Request<{ id: string }, unknown, GenerateTokenBody>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const { userId, role } = req.body;

  // ── Validación ──────────────────────────────────────────
  if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
    throw new ValidationError("El campo 'userId' es requerido y no puede estar vacío");
  }

  if (!role || !["HOST", "PARTICIPANTE"].includes(role)) {
    throw new ValidationError("El campo 'role' es requerido. Valores válidos: HOST, PARTICIPANTE");
  }

  // ── Buscar sala ─────────────────────────────────────────
  const sala = await prisma.sala.findUnique({ where: { id } });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  if (!sala.streamRoomId) {
    throw new StreamServiceError("Sala no sincronizada con GetStream", 409);
  }

  // ── Generar token ───────────────────────────────────────
  const token = generateTokenService(userId.trim(), role, sala.streamRoomId);

  res.status(200).json({ token });
}
