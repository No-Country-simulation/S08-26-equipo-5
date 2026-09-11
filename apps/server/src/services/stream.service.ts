import { StreamClient } from "@stream-io/node-sdk";
import { randomUUID } from "node:crypto";
import { ValidationError } from "../errors/index.js";
import type { RoomRole } from "../types/stream.js";

const VALID_ROLES: RoomRole[] = ["HOST", "PARTICIPANTE"];

/**
 * Map roles de MeetStream a roles de GetStream.
 * HOST → admin (permisos de creación, finalización, expulsión)
 * PARTICIPANTE → user (permisos de unión, publicación de audio/video)
 */
const ROLE_MAP: Record<RoomRole, string> = {
  HOST: "admin",
  PARTICIPANTE: "user",
};

let clientInstance: StreamClient | null = null;

/**
 * Inicializa el cliente GetStream como singleton.
 * Valida variables de entorno (fail-fast) y retorna la instancia.
 */
export function initStreamClient(): StreamClient {
  if (clientInstance) {
    return clientInstance;
  }

  const apiKey = process.env.GETSTREAM_API_KEY;
  const apiSecret = process.env.GETSTREAM_API_SECRET;

  if (!apiKey) {
    throw new Error(
      "Variable de entorno GETSTREAM_API_KEY es requerida para inicializar GetStream"
    );
  }

  if (!apiSecret) {
    throw new Error(
      "Variable de entorno GETSTREAM_API_SECRET es requerida para inicializar GetStream"
    );
  }

  clientInstance = new StreamClient(apiKey, apiSecret);
  return clientInstance;
}

/**
 * Crea una sala de video en GetStream.
 * @param name Nombre de la sala (usado como ID del call)
 * @returns Objeto con el streamRoomId (cid) asignado por GetStream
 */
export async function createRoom(
  name: string
): Promise<{ streamRoomId: string }> {
  const client = initStreamClient();

  try {
    const callId = randomUUID();
    const call = client.video.call("default", callId);

    const response = await call.getOrCreate({
      data: {
        custom: { name },
      },
    });

    return { streamRoomId: response.call.cid };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error desconocido al crear sala";
    throw new Error(`GetStream createCall failed: ${message}`);
  }
}

/**
 * Genera un token de autenticación GetStream para un usuario.
 * @param userId ID del usuario
 * @param role Rol del usuario ("HOST" | "PARTICIPANTE")
 * @param callCid CID de la sala en GetStream (formato "type:id")
 * @returns Token JWT de GetStream
 */
export function generateToken(
  userId: string,
  role: RoomRole,
  callCid: string
): string {
  if (!VALID_ROLES.includes(role)) {
    throw new ValidationError(
      `Role inválido. Valores válidos: ${VALID_ROLES.join(", ")}`
    );
  }

  const client = initStreamClient();
  const streamRole = ROLE_MAP[role];

  return client.generateCallToken({
    user_id: userId,
    call_cids: [callCid],
    role: streamRole,
  });
}

/**
 * Resetea la instancia singleton (útil para testing).
 */
export function resetStreamClient(): void {
  clientInstance = null;
}
