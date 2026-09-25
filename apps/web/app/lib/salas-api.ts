export type Sala = {
  id: string;
  codigo: string;
  nombre: string;
  resumen?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  estado: string;
  streamRoomId?: string;
};

export type SalaResumen = Sala & {
  resumen: string | null;
  fechaFin: string | null;
  totalParticipantes: number;
  rol: "HOST" | "PARTICIPANTE";
};

export type SalaDetalle = Sala & {
  resumen: string | null;
  fechaFin: string | null;
  streamRoomId: string | null;
  enlace: string;
  totalParticipantes: number;
  participantes: Array<{
    id: string;
    nombre: string;
    apellido: string;
    email: string;
    rol: "HOST" | "PARTICIPANTE";
    estado: string;
    fechaIngreso: string | null;
  }>;
};

export type JoinParticipantResponse = {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  message?: string;
};
import { getAccessToken } from "./auth";

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

type CreateRoomResponse = {
  salaId: string;
  codigo: string;
  nombre: string;
  enlace: string;
  streamRoomId: string;
};

export type RoomTokenResponse = {
  token: string;
};

const ROOMS_API_URL =
  process.env.NEXT_PUBLIC_ROOMS_API_URL ?? "http://localhost:4000/api/v1";

export function getRealtimeUrl() {
  return new URL(ROOMS_API_URL).origin;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOMS_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error?.message ?? "No se pudo completar la solicitud.");
  }

  return response.json() as Promise<T>;
}

export function createSala(input: {
  nombre: string;
  fechaInicio: string;
}): Promise<Sala> {
  return request<CreateRoomResponse>("/salas", {
    method: "POST",
    body: JSON.stringify({
      nombre: input.nombre,
      fechaInicio: input.fechaInicio,
    }),
  }).then((room) => ({
    id: room.salaId,
    codigo: room.codigo,
    nombre: room.nombre,
    fechaInicio: input.fechaInicio,
    estado: "PROGRAMADA",
    streamRoomId: room.streamRoomId,
  }));
}

export function generateRoomToken(
  salaId: string,
  userId: string,
  role: "HOST" | "PARTICIPANTE",
): Promise<RoomTokenResponse> {
  return request<RoomTokenResponse>(`/rooms/${encodeURIComponent(salaId)}/token`, {
    method: "POST",
    body: JSON.stringify({ userId, role, callCid: "" }),
  });
}

export function getSalaByCode(code: string): Promise<Sala> {
  return request<Sala>(`/salas/${encodeURIComponent(code)}`);
}

export function getMisParticipaciones(): Promise<{ salas: SalaResumen[] }> {
  return request<{ salas: SalaResumen[] }>("/salas/mis-participaciones");
}

export function getSalaDetalle(salaId: string): Promise<SalaDetalle> {
  return request<SalaDetalle>(`/salas/${encodeURIComponent(salaId)}/detalle`);
}

export function requestSalaJoin(
  code: string,
  input: {
    nombre: string;
    apellido: string;
    email: string;
  },
): Promise<JoinParticipantResponse> {
  return request<JoinParticipantResponse>(
    `/salas/${encodeURIComponent(code)}/join`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
