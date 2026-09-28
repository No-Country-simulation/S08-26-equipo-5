import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { verifyParticipantToken } from "../utils/participantToken.js";
import type { RoomRole } from "../types/stream.js";

interface AuthParticipanteOptions {
  /**
   * Exigir que el participante esté APROBADO. Por defecto true.
   * Se desactiva en endpoints de consulta de estado, donde un PENDIENTE
   * también necesita poder preguntar "¿ya me aprobaron?".
   */
  requireApproved?: boolean;
}

function readBearer(req: Request): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Token ausente, inválido o expirado",
    );
  }
  return header.slice("Bearer ".length);
}

/**
 * Resuelve el Participante detrás de la petición.
 *
 * Acepta dos credenciales distintas sobre el mismo header Bearer:
 *   - access token de usuario  → busca el participante por (salaId, usuarioId)
 *   - guest JWT de participante → busca el participante por su id
 *
 * Deja el resultado en `req.participante` para que los controllers no tengan
 * que repetir la resolución ni decidir el rol. El rol SIEMPRE sale de la base
 * de datos: ningún endpoint debe aceptarlo del body.
 */
export function authParticipante(
  options: AuthParticipanteOptions = {},
): RequestHandler {
  const requireApproved = options.requireApproved ?? true;

  return async function authParticipanteMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    try {
      const salaId = req.params.salaId;
      if (!salaId || Array.isArray(salaId)) {
        throw new AppError(400, "VALIDATION_ERROR", "salaId es requerido");
      }

      const token = readBearer(req);
      const guest = verifyParticipantToken(token);

      let participante;

      if (guest) {
        // ── Invitado con guest JWT ─────────────────────────
        if (guest.salaId !== salaId) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "El token no corresponde a esta sala",
          );
        }

        participante = await prisma.participante.findUnique({
          where: { id: guest.sub },
          include: { sala: true },
        });
      } else {
        // ── Usuario registrado con access token ────────────
        let payload: jwt.JwtPayload;
        try {
          payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
        } catch {
          throw new AppError(
            401,
            "UNAUTHORIZED",
            "Token ausente, inválido o expirado",
          );
        }

        if (typeof payload.sub !== "string") {
          throw new AppError(
            401,
            "UNAUTHORIZED",
            "Token ausente, inválido o expirado",
          );
        }

        participante = await prisma.participante.findFirst({
          where: { salaId, usuarioId: payload.sub },
          include: { sala: true },
        });
      }

      if (!participante || participante.salaId !== salaId) {
        throw new AppError(
          403,
          "NOT_A_PARTICIPANT",
          "No sos participante de esta sala",
        );
      }

      const sala = participante.sala;

      if (sala.estado === "CANCELADA") {
        throw new AppError(409, "ROOM_CANCELLED", "La sala fue cancelada");
      }

      if (sala.estado === "FINALIZADA") {
        throw new AppError(409, "ROOM_FINISHED", "La reunión ya finalizó");
      }

      if (participante.estado === "RECHAZADO") {
        throw new AppError(
          403,
          "JOIN_REJECTED",
          "El host rechazó tu solicitud de ingreso",
        );
      }

      if (requireApproved && participante.estado !== "APROBADO") {
        throw new AppError(
          403,
          "JOIN_NOT_APPROVED",
          "Tu ingreso todavía no fue aprobado por el host",
        );
      }

      req.participante = {
        participanteId: participante.id,
        salaId: participante.salaId,
        rol: participante.rol as RoomRole,
        estado: participante.estado,
        nombre: participante.nombre,
        apellido: participante.apellido,
        email: participante.email,
        esInvitado: guest !== null,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
