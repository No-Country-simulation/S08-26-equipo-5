import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  StreamServiceError,
} from "../errors/index.js";
import {
  createRoom as createRoomService,
  generateToken as generateTokenService,
} from "../services/stream.service.js";
import type {
  CreateSalaBody,
  CreateSalaResponse,
  SalaPublica,
  SalaResumen,
  SalaDetalle,
  UpdateSalaBody,
  UpdateSalaResponse,
  ParticipantesResponse,
  GenerateTokenBody,
} from "../types/stream.js";

const prisma = new PrismaClient();

// ─── Helpers ──────────────────────────────────────────────

/**
 * Genera un código corto y URL-friendly (8 caracteres).
 * Formato: 4 letras + 4 números (ej: "ABCD1234")
 */
function generateUniqueCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I, O para evitar confusión
  const numbers = "23456789"; // sin 0, 1 para evitar confusión

  let code = "";
  for (let i = 0; i < 4; i++) {
    code += letters[crypto.randomInt(letters.length)];
  }
  for (let i = 0; i < 4; i++) {
    code += numbers[crypto.randomInt(numbers.length)];
  }
  return code;
}

/**
 * Verifica colisión y genera código único (máx. 10 intentos).
 */
async function generateUniqueCodeWithRetry(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateUniqueCode();
    const exists = await prisma.sala.findUnique({ where: { codigo: code } });
    if (!exists) return code;
  }
  throw new Error("No se pudo generar un código único tras 10 intentos");
}

/**
 * Verifica si el usuario es HOST de la sala.
 */
async function isHost(salaId: string, userId: string): Promise<boolean> {
  const participante = await prisma.participante.findUnique({
    where: {
      salaId_usuarioId: { salaId, usuarioId: userId },
    },
  });
  return participante?.rol === "HOST";
}

// ─── POST /salas — Crear sala (auth JWT requerido) ────────

/**
 * Crea una sala con código único y agrega al creador como HOST.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function createSala(
  req: Request<unknown, unknown, CreateSalaBody>,
  res: Response
): Promise<void> {
  const { nombre, resumen, fechaInicio } = req.body;
  const userId = req.user?.sub;

  // ── Validación de auth ───────────────────────────────────
  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // ── Validación de body ───────────────────────────────────
  if (!nombre || typeof nombre !== "string" || nombre.trim().length === 0) {
    throw new ValidationError(
      "El campo 'nombre' es requerido y no puede estar vacío"
    );
  }

  if (nombre.length > 150) {
    throw new ValidationError(
      "El campo 'nombre' no puede exceder 150 caracteres"
    );
  }

  // ── Generar código único ─────────────────────────────────
  const codigo = await generateUniqueCodeWithRetry();

  // ── Crear sala en GetStream ──────────────────────────────
  const { streamRoomId } = await createRoomService(nombre.trim(), userId);

  // ── Transacción Prisma: Sala + Participante HOST ─────────
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Crear la sala
      const sala = await tx.sala.create({
        data: {
          codigo,
          nombre: nombre.trim(),
          resumen: resumen?.trim() || null,
          fechaInicio: fechaInicio ? new Date(fechaInicio) : new Date(),
          estado: "PROGRAMADA",
          streamRoomId,
        },
      });

      // 2. Obtener datos del usuario para el participante
      const usuario = await tx.usuario.findUnique({
        where: { id: userId },
        select: { nombre: true, apellido: true, email: true },
      });

      if (!usuario) {
        throw new ValidationError("Usuario no encontrado en la base de datos");
      }

      // 3. Agregar al creador como HOST
      await tx.participante.create({
        data: {
          salaId: sala.id,
          usuarioId: userId,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          email: usuario.email,
          rol: "HOST",
          estado: "APROBADO",
          fechaIngreso: new Date(),
        },
      });

      return sala;
    });

    // ── Respuesta exitosa ───────────────────────────────────
    const enlace = `${process.env.FRONTEND_URL || "http://localhost:3000"}/sala/${codigo}`;

    res.status(201).json({
      salaId: result.id,
      codigo: result.codigo,
      nombre: result.nombre,
      enlace,
      streamRoomId,
    } satisfies CreateSalaResponse);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    const message =
      error instanceof Error ? error.message : "Error desconocido al crear sala";
    throw new StreamServiceError(`Error al guardar sala en base de datos: ${message}`);
  }
}

// ─── GET /salas/mis-salas — Salas donde soy HOST ──────────

/**
 * Retorna las salas donde el usuario autenticado es HOST.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function getMisSalas(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // Buscar salas donde el usuario es HOST
  const participantes = await prisma.participante.findMany({
    where: {
      usuarioId: userId,
      rol: "HOST",
    },
    include: {
      sala: {
        include: {
          _count: {
            select: { participantes: true },
          },
        },
      },
    },
    orderBy: {
      sala: { fechaInicio: "desc" },
    },
  });

  const salas: SalaResumen[] = participantes.map((p) => ({
    id: p.sala.id,
    codigo: p.sala.codigo,
    nombre: p.sala.nombre,
    resumen: p.sala.resumen,
    fechaInicio: p.sala.fechaInicio.toISOString(),
    fechaFin: p.sala.fechaFin?.toISOString() || null,
    estado: p.sala.estado,
    totalParticipantes: p.sala._count.participantes,
    esHost: true,
  }));

  res.status(200).json({ salas });
}

// ─── GET /salas/programadas — Salas futuras ───────────────

/**
 * Retorna salas con fecha de inicio futura o当天 (estado PROGRAMADA o ACTIVA).
 * Requiere: Authorization: Bearer <jwt>
 */
export async function getSalasProgramadas(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  const now = new Date();

  // Buscar salas programadas o activas
  const salas = await prisma.sala.findMany({
    where: {
      estado: { in: ["PROGRAMADA", "ACTIVA"] },
      fechaInicio: { gte: now },
    },
    include: {
      _count: {
        select: { participantes: true },
      },
      participantes: {
        where: { usuarioId: userId },
        select: { rol: true },
      },
    },
    orderBy: { fechaInicio: "asc" },
    take: 20, // Limitar a 20 salas próximas
  });

  const salasResponse: SalaResumen[] = salas.map((sala) => ({
    id: sala.id,
    codigo: sala.codigo,
    nombre: sala.nombre,
    resumen: sala.resumen,
    fechaInicio: sala.fechaInicio.toISOString(),
    fechaFin: sala.fechaFin?.toISOString() || null,
    estado: sala.estado,
    totalParticipantes: sala._count.participantes,
    esHost: sala.participantes.some((p) => p.rol === "HOST"),
  }));

  res.status(200).json({ salas: salasResponse });
}

// ─── GET /salas/:id/detalle — Detalle completo ────────────

/**
 * Retorna el detalle completo de una sala con participantes.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function getSalaDetalle(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  const sala = await prisma.sala.findUnique({
    where: { id },
    include: {
      participantes: {
        include: {
          usuario: {
            select: { id: true, nombre: true, apellido: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // Encontrar el HOST (creador)
  const hostParticipante = sala.participantes.find((p) => p.rol === "HOST");
  const creador = hostParticipante?.usuario;

  const enlace = `${process.env.FRONTEND_URL || "http://localhost:3000"}/sala/${sala.codigo}`;

  const response: SalaDetalle = {
    id: sala.id,
    codigo: sala.codigo,
    nombre: sala.nombre,
    resumen: sala.resumen,
    fechaInicio: sala.fechaInicio.toISOString(),
    fechaFin: sala.fechaFin?.toISOString() || null,
    estado: sala.estado,
    streamRoomId: sala.streamRoomId,
    enlace,
    totalParticipantes: sala.participantes.length,
    participantes: sala.participantes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      apellido: p.apellido,
      email: p.email,
      rol: p.rol,
      estado: p.estado,
      fechaIngreso: p.fechaIngreso?.toISOString() || null,
    })),
    creador: creador
      ? {
          id: creador.id,
          nombre: creador.nombre,
          apellido: creador.apellido,
          email: creador.email,
        }
      : { id: "", nombre: "Desconocido", apellido: "", email: "" },
  };

  res.status(200).json(response);
}

// ─── PUT /salas/:id — Actualizar sala (solo HOST) ─────────

/**
 * Actualiza nombre, resumen o fecha de una sala.
 * Solo el HOST puede actualizar.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function updateSala(
  req: Request<{ id: string }, unknown, UpdateSalaBody>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const { nombre, resumen, fechaInicio } = req.body;
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // Verificar que la sala existe
  const sala = await prisma.sala.findUnique({ where: { id } });
  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // Verificar que el usuario es HOST
  const userIsHost = await isHost(id, userId);
  if (!userIsHost) {
    throw new ForbiddenError("Solo el HOST puede actualizar la sala");
  }

  // Preparar datos de actualización
  const updateData: {
    nombre?: string;
    resumen?: string | null;
    fechaInicio?: Date;
  } = {};

  if (nombre !== undefined) {
    if (!nombre || nombre.trim().length === 0) {
      throw new ValidationError("El nombre no puede estar vacío");
    }
    if (nombre.length > 150) {
      throw new ValidationError("El nombre no puede exceder 150 caracteres");
    }
    updateData.nombre = nombre.trim();
  }

  if (resumen !== undefined) {
    updateData.resumen = resumen?.trim() || null;
  }

  if (fechaInicio !== undefined) {
    updateData.fechaInicio = new Date(fechaInicio);
  }

  // Actualizar
  const updated = await prisma.sala.update({
    where: { id },
    data: updateData,
  });

  const response: UpdateSalaResponse = {
    id: updated.id,
    codigo: updated.codigo,
    nombre: updated.nombre,
    resumen: updated.resumen,
    fechaInicio: updated.fechaInicio.toISOString(),
  };

  res.status(200).json(response);
}

// ─── DELETE /salas/:id — Cancelar sala (solo HOST) ────────

/**
 * Cancela una sala (cambia estado a CANCELADA).
 * Solo el HOST puede cancelar.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function deleteSala(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // Verificar que la sala existe
  const sala = await prisma.sala.findUnique({ where: { id } });
  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // Verificar que el usuario es HOST
  const userIsHost = await isHost(id, userId);
  if (!userIsHost) {
    throw new ForbiddenError("Solo el HOST puede cancelar la sala");
  }

  // No cancelar si ya está cancelada o finalizada
  if (sala.estado === "CANCELADA") {
    throw new ValidationError("La sala ya está cancelada");
  }

  if (sala.estado === "FINALIZADA") {
    throw new ValidationError("No se puede cancelar una sala finalizada");
  }

  // Cancelar sala
  await prisma.sala.update({
    where: { id },
    data: {
      estado: "CANCELADA",
      fechaFin: new Date(),
    },
  });

  res.status(200).json({ message: "Sala cancelada exitosamente" });
}

// ─── GET /salas/:id/participantes — Lista de participantes ─

/**
 * Retorna la lista de participantes de una sala.
 * Requiere: Authorization: Bearer <jwt>
 */
export async function getParticipantes(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // Verificar que la sala existe
  const sala = await prisma.sala.findUnique({
    where: { id },
    select: { id: true, nombre: true },
  });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // Obtener participantes
  const participantes = await prisma.participante.findMany({
    where: { salaId: id },
    orderBy: { createdAt: "asc" },
  });

  const response: ParticipantesResponse = {
    salaId: sala.id,
    salaNombre: sala.nombre,
    total: participantes.length,
    participantes: participantes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      apellido: p.apellido,
      email: p.email,
      rol: p.rol,
      estado: p.estado,
      fechaIngreso: p.fechaIngreso?.toISOString() || null,
    })),
  };

  res.status(200).json(response);
}

// ─── POST /rooms/:id/token — Generar token (legacy) ───────

/**
 * Genera un token GetStream para un participante.
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
    throw new ValidationError(
      "El campo 'role' es requerido. Valores válidos: HOST, PARTICIPANTE"
    );
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

// ─── GET /salas/:code — Consulta pública ──────────────────

/**
 * Retorna datos públicos de una sala por su código.
 * No requiere autenticación.
 */
export async function getSalaByCode(
  req: Request<{ code: string }>,
  res: Response
): Promise<void> {
  const { code } = req.params;

  // ── Validación de código ─────────────────────────────────
  if (!code || code.trim().length === 0) {
    throw new ValidationError("El código de sala es requerido");
  }

  // ── Buscar sala ──────────────────────────────────────────
  const sala = await prisma.sala.findUnique({
    where: { codigo: code.toUpperCase() },
    include: {
      _count: {
        select: { participantes: true },
      },
    },
  });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // ── Respuesta pública ────────────────────────────────────
  res.status(200).json({
    id: sala.id,
    codigo: sala.codigo,
    nombre: sala.nombre,
    resumen: sala.resumen,
    fechaInicio: sala.fechaInicio.toISOString(),
    estado: sala.estado,
    totalParticipantes: sala._count.participantes,
  } satisfies SalaPublica);
}
