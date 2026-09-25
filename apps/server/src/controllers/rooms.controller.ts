import type { Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  StreamServiceError,
} from "../errors/index.js";
import { AppError } from "../utils/AppError.js";
import {
  createRoom as createRoomService,
  issueCallAccess,
} from "../services/stream.service.js";
import {
  requestJoin,
  getStreamCallRef,
  validateJoinInput,
  type WaitingRoomDeps,
} from "../services/waitingRoom.service.js";
import { PrismaParticipanteRepository } from "../repositories/participante.repository.js";
import { PrismaSalaRepository } from "../repositories/sala.repository.js";
import type {
  CreateSalaBody,
  CreateSalaResponse,
  SalaPublica,
  SalaResumen,
  SalaDetalle,
  UpdateSalaBody,
  UpdateSalaResponse,
  ParticipantesResponse,
  TransferHostBody,
  TransferHostResponse,
  JoinSalaBody,
  JoinSalaResponse,
  StreamTokenResponse,
  MiEstadoResponse,
} from "../types/stream.js";

const waitingRoomDeps: WaitingRoomDeps = {
  participantes: new PrismaParticipanteRepository(prisma),
  salas: new PrismaSalaRepository(prisma),
};

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
  const { streamRoomId, callType, callId } = await createRoomService(
    nombre.trim(),
    userId
  );

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
          estado: fechaInicio ? "PROGRAMADA" : "ACTIVA",
          streamRoomId,
          streamCallType: callType,
          streamCallId: callId,
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
          // Normalizado: el lookup de participantes es por email.
          email: usuario.email.trim().toLowerCase(),
          rol: "HOST",
          estado: "APROBADO",
          fechaIngreso: new Date(),
        },
      });

      return sala;
    });

    // ── Respuesta exitosa ───────────────────────────────────
    const enlace = `${env.frontendUrl}/sala/${codigo}`;

    res.status(201).json({
      salaId: result.id,
      codigo: result.codigo,
      nombre: result.nombre,
      enlace,
      streamRoomId,
      stream: { callType, callId, callCid: streamRoomId },
    } satisfies CreateSalaResponse);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    const message =
      error instanceof Error ? error.message : "Error desconocido al crear sala";
    throw new StreamServiceError(`Error al guardar sala en base de datos: ${message}`);
  }
}

// ─── GET /salas/mis-participaciones — Todas mis salas ─────

/**
 * Retorna todas las salas donde el usuario autenticado es participante (HOST o PARTICIPANTE).
 * Requiere: Authorization: Bearer <jwt>
 */
export async function getMisParticipaciones(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  // Buscar todas las salas donde el usuario participa
  const participantes = await prisma.participante.findMany({
    where: {
      usuarioId: userId,
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
    rol: p.rol,
  }));

  res.status(200).json({ salas });
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

  const enlace = `${env.frontendUrl}/sala/${sala.codigo}`;

  const response: SalaDetalle = {
    id: sala.id,
    codigo: sala.codigo,
    nombre: sala.nombre,
    resumen: sala.resumen,
    fechaInicio: sala.fechaInicio.toISOString(),
    fechaFin: sala.fechaFin?.toISOString() || null,
    estado: sala.estado,
    streamRoomId: sala.streamRoomId,
    stream: getStreamCallRef(sala),
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

// ─── POST /salas/:id/transfer-host — Transferir rol HOST ─

/**
 * Transfiere el rol de HOST a otro participante de la sala.
 * Solo el HOST actual puede transferir. El caller queda PARTICIPANTE
 * y el target pasa a HOST, preservando el `estado` de ambos.
 * Cualquier participante existente califica (PENDIENTE o APROBADO).
 * Requiere: Authorization: Bearer <jwt>
 */
export async function transferHost(
  req: Request<{ id: string }, unknown, TransferHostBody>,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const { nuevoHostId } = req.body;
  const userId = req.user?.sub;

  if (!userId) {
    throw new ValidationError("Usuario no autenticado");
  }

  if (!nuevoHostId || typeof nuevoHostId !== "string") {
    throw new ValidationError("El campo 'nuevoHostId' es requerido");
  }

  // Verificar que la sala existe
  const sala = await prisma.sala.findUnique({ where: { id } });
  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  // Verificar que el usuario es HOST
  const userIsHost = await isHost(id, userId);
  if (!userIsHost) {
    throw new ForbiddenError("Solo el HOST puede transferir el rol");
  }

  // No permitir auto-transferencia
  if (nuevoHostId === userId) {
    throw new ValidationError("No puedes transferir el rol a ti mismo");
  }

  // El nuevo host debe ser participante existente de la sala
  const target = await prisma.participante.findUnique({
    where: { salaId_usuarioId: { salaId: id, usuarioId: nuevoHostId } },
  });
  if (!target) {
    throw new NotFoundError("El nuevo host debe ser participante de la sala");
  }

  // Demover caller y promover target en una sola transacción.
  // Guard anti-TOCTOU: el pre-check isHost() ocurre fuera de la tx; aquí el
  // demote exige `rol: "HOST"` vía updateMany y count === 1. Dos transfers
  // concurrentes pasan el pre-check, pero solo una demote gana (count 1);
  // la otra recibe count 0 → 403 y rollback antes de promover (evita doble HOST).
  // El promote queda como `update` simple: solo corre si el demote ganó la
  // carrera, así que no necesita condición propia.
  await prisma.$transaction(async (tx) => {
    const demoted = await tx.participante.updateMany({
      where: { salaId: id, usuarioId: userId, rol: "HOST" },
      data: { rol: "PARTICIPANTE" },
    });
    if (demoted.count !== 1) {
      throw new ForbiddenError("Solo el HOST puede transferir el rol");
    }
    await tx.participante.update({
      where: { salaId_usuarioId: { salaId: id, usuarioId: nuevoHostId } },
      data: { rol: "HOST" },
    });
  });

  const response: TransferHostResponse = {
    message: "Rol de HOST transferido exitosamente",
    host: { usuarioId: nuevoHostId },
    previousHost: { usuarioId: userId },
  };

  res.status(200).json(response);
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

// ─── POST /salas/:code/join — Solicitar ingreso (público) ──

/**
 * Da de alta (o reutiliza) al invitado en la sala de espera y avisa al HOST
 * por Socket.IO. Es el paso 1 del flujo de ingreso.
 *
 * Si el participante ya estaba aprobado y su aprobación sigue vigente,
 * devuelve directamente el accessToken: así un refresh del navegador no
 * obliga a volver a pedir permiso.
 */
export async function joinSala(
  req: Request<{ code: string }, unknown, JoinSalaBody>,
  res: Response
): Promise<void> {
  const { code } = req.params;
  const { nombre, apellido, email } = req.body ?? {};

  // Misma validación que el evento de socket join:request (mismos códigos
  // de error): vive en waitingRoom.service.ts para no duplicarla.
  const validado = validateJoinInput({ salaCodigo: code, nombre, apellido, email });

  const result = await requestJoin(waitingRoomDeps, {
    salaCodigo: validado.salaCodigo,
    nombre: validado.nombre,
    apellido: validado.apellido,
    email: validado.email,
    // Si vino con sesión iniciada, queda vinculado a su usuario.
    usuarioId: req.user?.sub ?? null,
  });

  res.status(200).json({
    participanteId: result.participanteId,
    estado: result.estado,
    salaId: result.salaId,
    ...(result.accessToken ? { accessToken: result.accessToken } : {}),
    ...(result.stream ? { stream: result.stream } : {}),
  } satisfies JoinSalaResponse);
}

// ─── POST /salas/:salaId/stream-token — Token de GetStream ─

/**
 * Emite el token de GetStream para el participante autenticado.
 *
 * Sirve tanto para el HOST (access token de usuario) como para un invitado
 * aprobado (guest JWT). El rol se lee de la base de datos: el body no
 * influye, así que nadie puede pedirse a sí mismo un token de admin.
 *
 * Requiere authParticipante — ese middleware ya validó pertenencia a la sala,
 * estado APROBADO y que la reunión siga vigente.
 */
export async function getStreamToken(
  req: Request<{ salaId: string }>,
  res: Response
): Promise<void> {
  const ctx = req.participante;
  if (!ctx) {
    throw new AppError(401, "UNAUTHORIZED", "Participante no autenticado");
  }

  const sala = await prisma.sala.findUnique({
    where: { id: ctx.salaId },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      estado: true,
      streamRoomId: true,
      streamCallType: true,
      streamCallId: true,
    },
  });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  const call = getStreamCallRef(sala);
  if (!call) {
    throw new StreamServiceError("Sala no sincronizada con GetStream", 409);
  }

  const nombreCompleto =
    [ctx.nombre, ctx.apellido].filter(Boolean).join(" ").trim() || ctx.email;

  // Crea el usuario en GetStream, lo agrega como member del call y firma
  // un token restringido a ese call.
  const { token, expiresAt, callCid } = await issueCallAccess({
    userId: ctx.participanteId,
    name: nombreCompleto,
    role: ctx.rol,
    callType: call.callType,
    callId: call.callId,
  });

  res.status(200).json({
    apiKey: env.getstreamApiKey,
    token,
    userId: ctx.participanteId,
    user: { id: ctx.participanteId, name: nombreCompleto },
    rol: ctx.rol,
    callType: call.callType,
    callId: call.callId,
    callCid,
    sala: { id: sala.id, codigo: sala.codigo, nombre: sala.nombre, estado: sala.estado },
    expiresAt: expiresAt.toISOString(),
  } satisfies StreamTokenResponse);
}

// ─── POST /rooms/:id/token — Alias legacy (deprecated) ────

/**
 * @deprecated Alias de POST /salas/:salaId/stream-token, mantenido para no
 * romper clientes viejos (apps/web todavía le pega a esta ruta). Delega en
 * exactamente la misma lógica segura: la ruta usa `authParticipante`, así
 * que el rol y el usuario siempre salen de la DB/JWT vía `req.participante`
 * y el body se ignora por completo (userId/role del body nunca se leen).
 * Usar /salas/:salaId/stream-token en integraciones nuevas.
 */
export const generateToken = getStreamToken;

// ─── GET /salas/:salaId/mi-estado — Recuperar sesión ───────

/**
 * Devuelve el estado del participante autenticado.
 * Permite que el cliente recupere la sesión tras recargar la página sin
 * volver a pasar por la aprobación del host.
 *
 * Usa authParticipante({ requireApproved: false }): un PENDIENTE también
 * necesita poder consultar.
 */
export async function getMiEstado(
  req: Request<{ salaId: string }>,
  res: Response
): Promise<void> {
  const ctx = req.participante;
  if (!ctx) {
    throw new AppError(401, "UNAUTHORIZED", "Participante no autenticado");
  }

  const sala = await prisma.sala.findUnique({
    where: { id: ctx.salaId },
    select: {
      id: true,
      codigo: true,
      nombre: true,
      estado: true,
      streamRoomId: true,
      streamCallType: true,
      streamCallId: true,
    },
  });

  if (!sala) {
    throw new NotFoundError("Sala no encontrada");
  }

  const call = ctx.estado === "APROBADO" ? getStreamCallRef(sala) : null;

  res.status(200).json({
    participanteId: ctx.participanteId,
    estado: ctx.estado,
    rol: ctx.rol,
    sala: { id: sala.id, codigo: sala.codigo, nombre: sala.nombre, estado: sala.estado },
    stream: call,
  } satisfies MiEstadoResponse);
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
