import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { RoomRole } from "../types/stream.js";

/**
 * Credencial del invitado ("guest JWT").
 *
 * Un participante invitado no tiene cuenta en MeetFlow, así que no puede
 * presentar un access token de usuario. Al aprobarlo, el backend le firma
 * este token para que pueda pedir su token de GetStream y consultar su
 * estado sin volver a pasar por la aprobación del host.
 *
 * Se firma con el mismo JWT_SECRET que el access token de usuario; el claim
 * `typ` es lo que impide confundir uno con otro en ambos sentidos.
 */
export const PARTICIPANT_TOKEN_TYPE = "participant" as const;

export interface ParticipantTokenPayload {
  /** Participante.id — también es el user_id en GetStream. */
  sub: string;
  salaId: string;
  rol: RoomRole;
  typ: typeof PARTICIPANT_TOKEN_TYPE;
  iat?: number;
  exp?: number;
}

export interface SignParticipantTokenInput {
  participanteId: string;
  salaId: string;
  rol: RoomRole;
}

export function signParticipantToken(
  input: SignParticipantTokenInput,
): string {
  const payload = {
    sub: input.participanteId,
    salaId: input.salaId,
    rol: input.rol,
    typ: PARTICIPANT_TOKEN_TYPE,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.participantTokenTtlSeconds,
  });
}

/** Devuelve la fecha de expiración que tendrá un token firmado ahora. */
export function participantTokenExpiresAt(): Date {
  return new Date(Date.now() + env.participantTokenTtlSeconds * 1000);
}

/**
 * Verifica un guest JWT. Devuelve null si el token no es válido o si no es
 * de tipo participante (por ejemplo, si llega un access token de usuario).
 */
export function verifyParticipantToken(
  token: string,
): ParticipantTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;

    if (payload.typ !== PARTICIPANT_TOKEN_TYPE) return null;
    if (typeof payload.sub !== "string") return null;
    if (typeof payload.salaId !== "string") return null;

    return payload as ParticipantTokenPayload;
  } catch {
    return null;
  }
}
