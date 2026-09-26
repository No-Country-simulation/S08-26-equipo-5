import { StreamClient } from "@stream-io/node-sdk";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { ValidationError, StreamServiceError } from "../errors/index.js";
import type { RoomRole } from "../types/stream.js";

const VALID_ROLES: RoomRole[] = ["HOST", "PARTICIPANTE"];

/** Tipo de call de GetStream que usamos para todas las salas. */
export const DEFAULT_CALL_TYPE = "default";

/**
 * Map de roles de MeetFlow a roles de GetStream.
 * HOST → admin (crear, finalizar, expulsar)
 * PARTICIPANTE → user (unirse, publicar audio/video)
 */
const ROLE_MAP: Record<RoomRole, string> = {
  HOST: "admin",
  PARTICIPANTE: "user",
};

export function toStreamRole(role: RoomRole): string {
  if (!VALID_ROLES.includes(role)) {
    throw new ValidationError(
      `Role inválido. Valores válidos: ${VALID_ROLES.join(", ")}`,
    );
  }
  return ROLE_MAP[role];
}

/** Construye el CID que GetStream usa para identificar un call. */
export function buildCallCid(callType: string, callId: string): string {
  return `${callType}:${callId}`;
}

let clientInstance: StreamClient | null = null;

/**
 * Inicializa el cliente GetStream como singleton.
 * Las credenciales se validan en config/env.ts (fail-fast al arrancar).
 */
export function initStreamClient(): StreamClient {
  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = new StreamClient(env.getstreamApiKey, env.getstreamApiSecret);
  return clientInstance;
}

export interface CreatedRoom {
  /** CID completo "<type>:<id>" — es lo que persiste Sala.streamRoomId. */
  streamRoomId: string;
  callType: string;
  callId: string;
}

/**
 * Crea una sala de video en GetStream.
 * @param name Nombre visible de la sala
 * @param userId ID del usuario que la crea
 */
export async function createRoom(
  name: string,
  userId?: string,
): Promise<CreatedRoom> {
  const client = initStreamClient();
  const callId = randomUUID();
  const callType = DEFAULT_CALL_TYPE;

  try {
    const call = client.video.call(callType, callId);

    await call.getOrCreate({
      data: {
        custom: { name },
        created_by_id: userId || "system",
      },
    });

    return {
      streamRoomId: buildCallCid(callType, callId),
      callType,
      callId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al crear sala";
    throw new StreamServiceError(`GetStream createCall failed: ${message}`);
  }
}

/**
 * Crea o actualiza el usuario en GetStream.
 *
 * Los invitados no tienen cuenta en MeetFlow, así que su identidad en Stream
 * es el `Participante.id`. Sin este upsert el token apunta a un usuario que
 * no existe y el `name` no se muestra en la llamada.
 */
export async function upsertStreamUser(user: {
  id: string;
  name?: string | null;
  role?: string;
}): Promise<void> {
  const client = initStreamClient();

  try {
    await client.upsertUsers([
      {
        id: user.id,
        name: user.name ?? undefined,
        role: user.role ?? "user",
      },
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    throw new StreamServiceError(`GetStream upsertUsers failed: ${message}`);
  }
}

/**
 * Agrega (o actualiza) a un usuario como miembro del call.
 * Es lo que permite controlar quién entra desde el lado de GetStream.
 */
export async function addCallMember(
  callType: string,
  callId: string,
  userId: string,
  role: string,
): Promise<void> {
  const client = initStreamClient();

  try {
    const call = client.video.call(callType, callId);
    await call.updateCallMembers({
      update_members: [{ user_id: userId, role }],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    throw new StreamServiceError(
      `GetStream updateCallMembers failed: ${message}`,
    );
  }
}

export interface IssuedStreamToken {
  token: string;
  expiresAt: Date;
}

/**
 * Genera un token de GetStream restringido a un call concreto.
 *
 * @param userId  ID del usuario en Stream (para invitados: Participante.id)
 * @param role    Rol de MeetFlow — se traduce con ROLE_MAP
 * @param callCid CID del call ("<type>:<id>")
 */
export function generateToken(
  userId: string,
  role: RoomRole,
  callCid: string,
  ttlSeconds: number = env.streamTokenTtlSeconds,
): IssuedStreamToken {
  const streamRole = toStreamRole(role);
  const client = initStreamClient();

  const token = client.generateCallToken({
    user_id: userId,
    call_cids: [callCid],
    role: streamRole,
    validity_in_seconds: ttlSeconds,
  });

  return {
    token,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}

/**
 * Deja al participante listo para entrar al call: lo crea en Stream,
 * lo agrega como miembro y le emite el token.
 */
export async function issueCallAccess(params: {
  userId: string;
  name?: string | null;
  role: RoomRole;
  callType: string;
  callId: string;
}): Promise<IssuedStreamToken & { callCid: string }> {
  const streamRole = toStreamRole(params.role);
  const callCid = buildCallCid(params.callType, params.callId);

  await upsertStreamUser({ id: params.userId, name: params.name });
  await addCallMember(params.callType, params.callId, params.userId, streamRole);

  const { token, expiresAt } = generateToken(params.userId, params.role, callCid);

  return { token, expiresAt, callCid };
}

/** Resetea la instancia singleton (útil para testing). */
export function resetStreamClient(): void {
  clientInstance = null;
}
