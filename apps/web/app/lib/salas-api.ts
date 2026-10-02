export type SalaEstado = "PROGRAMADA" | "ACTIVA" | "FINALIZADA" | "CANCELADA";

export type Sala = {
  id: string;
  codigo: string;
  nombre: string;
  resumen?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  estado: SalaEstado;
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
    // null en invitados por correo que todavía no aceptaron (estado INVITADO).
    nombre: string | null;
    apellido: string | null;
    // null para quien no es HOST: el backend solo le muestra emails al host.
    email: string | null;
    rol: "HOST" | "PARTICIPANTE";
    estado: string;
    fechaIngreso: string | null;
  }>;
};

export type StreamCallRef = {
  callType: string;
  callId: string;
  callCid: string;
};

export type JoinSalaResponse = {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  salaId: string;
  accessToken: string;
  stream?: StreamCallRef;
};

export type MiEstadoResponse = {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  rol: "HOST" | "PARTICIPANTE";
  sala: { id: string; codigo: string; nombre: string; estado: string };
  stream: StreamCallRef | null;
};

export type StreamTokenResponse = {
  apiKey: string;
  token: string;
  userId: string;
  user: { id: string; name: string };
  rol: "HOST" | "PARTICIPANTE";
  callType: string;
  callId: string;
  callCid: string;
  sala: { id: string; codigo: string; nombre: string; estado: string };
  expiresAt: string;
};

export type ParticipanteSala = {
  id: string;
  // null en invitados por correo sin cuenta que no aceptaron (estado INVITADO).
  nombre: string | null;
  apellido: string | null;
  // null para quien no es HOST.
  email: string | null;
  rol: "HOST" | "PARTICIPANTE";
  estado: string;
  fechaIngreso: string | null;
};

export type ParticipantesResponse = {
  salaId: string;
  salaNombre: string;
  total: number;
  participantes: ParticipanteSala[];
};
import { getAccessToken } from "./auth";

type ApiErrorResponse = {
  error?: string | {
    code?: string;
    message?: string;
  };
  message?: string;
};

export class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type CreateRoomResponse = {
  salaId: string;
  codigo: string;
  nombre: string;
  enlace: string;
  streamRoomId: string;
};

const ROOMS_API_URL =
  process.env.NEXT_PUBLIC_ROOMS_API_URL ?? "http://localhost:4000/api/v1";

export function getRealtimeUrl() {
  return new URL(ROOMS_API_URL).origin;
}

async function requestWithToken<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${ROOMS_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    const errorMessage = typeof body?.error === 'string' 
      ? body.error 
      : body?.error?.message ?? body?.message ?? "No se pudo completar la solicitud.";
    const errorCode = typeof body?.error === 'object' ? body?.error?.code : undefined;
    throw new ApiRequestError(errorMessage, errorCode);
  }

  return response.json() as Promise<T>;
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
    const errorMessage = typeof body?.error === 'string' 
      ? body.error 
      : body?.error?.message ?? body?.message ?? "No se pudo completar la solicitud.";
    const errorCode = typeof body?.error === 'object' ? body?.error?.code : undefined;
    throw new ApiRequestError(errorMessage, errorCode);
  }

  return response.json() as Promise<T>;
}

export function createSala(input: {
  nombre: string;
  resumen?: string;
  fechaInicio?: string;
}): Promise<Sala> {
  return request<CreateRoomResponse>("/salas", {
    method: "POST",
    body: JSON.stringify({
      nombre: input.nombre,
      resumen: input.resumen,
      fechaInicio: input.fechaInicio,
    }),
  }).then((room) => ({
    id: room.salaId,
    codigo: room.codigo,
    nombre: room.nombre,
    fechaInicio: input.fechaInicio ?? "",
    estado: input.fechaInicio ? "PROGRAMADA" : "ACTIVA",
    streamRoomId: room.streamRoomId,
  }));
}

export function updateSala(
  salaId: string,
  input: { nombre: string; resumen: string | null },
): Promise<{ id: string; nombre: string; resumen: string | null; fechaInicio: string }> {
  return request(`/salas/${encodeURIComponent(salaId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
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

export function getParticipantes(
  salaId: string,
): Promise<ParticipantesResponse> {
  return request<ParticipantesResponse>(
    `/salas/${encodeURIComponent(salaId)}/participantes`,
  );
}

export function joinSala(
  code: string,
  input: {
    nombre?: string;
    apellido?: string;
    email?: string;
  },
): Promise<JoinSalaResponse> {
  return request<JoinSalaResponse>(
    `/salas/${encodeURIComponent(code)}/join`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getMiEstado(
  salaId: string,
  token: string,
): Promise<MiEstadoResponse> {
  return requestWithToken(
    `/salas/${encodeURIComponent(salaId)}/mi-estado`,
    token,
  );
}

export function getStreamToken(
  salaId: string,
  token: string,
): Promise<StreamTokenResponse> {
  return requestWithToken(
    `/salas/${encodeURIComponent(salaId)}/stream-token`,
    token,
    { method: "POST" },
  );
}

export function transferHost(
  salaId: string,
  nuevoHostId: string,
): Promise<{ message: string; host: { usuarioId: string }; previousHost: { usuarioId: string } }> {
  return request(
    `/salas/${encodeURIComponent(salaId)}/transfer-host`,
    {
      method: "POST",
      body: JSON.stringify({ nuevoHostId }),
    },
  );
}

export function cancelSala(salaId: string): Promise<{ message: string }> {
  return request(`/salas/${encodeURIComponent(salaId)}`, {
    method: "DELETE",
  });
}

export function finalizarSala(salaId: string): Promise<{ message: string }> {
  return request(`/salas/${encodeURIComponent(salaId)}/finalizar`, {
    method: "POST",
  });
}


// ── Invitaciones por correo (contrato PR #104, sin envoltorio { data }) ─────

/** Máximo de emails por solicitud de POST /salas/:id/invitaciones. */
export const MAX_INVITACIONES_POR_SOLICITUD = 20;

export type InvitacionEstado = "INVITADO" | "REENVIADO" | "YA_PARTICIPA";

export type InvitacionResultado = {
  email: string;
  estado: InvitacionEstado;
  /** false: la invitación quedó registrada pero el correo no salió (reintentable). */
  emailEnviado: boolean;
};

export type InvitarResponse = { resultados: InvitacionResultado[] };

export type InvitacionPreview = {
  sala: { id: string; nombre: string };
  /** Enmascarado por el backend: a***@dominio.com. */
  email: string;
  /** true si el invitado no tiene cuenta: hay que pedirle nombre y apellido. */
  requiereDatos: boolean;
  /** true si el invitado tiene cuenta: hay que iniciar sesión con ella. */
  requiereLogin: boolean;
};

export type AceptarInvitacionResponse = {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  salaId: string;
  salaCodigo: string;
  accessToken: string;
};

/** Invita por correo (solo HOST). El backend normaliza y deduplica los emails. */
export function invitarASala(salaId: string, emails: string[]): Promise<InvitarResponse> {
  return request<InvitarResponse>(`/salas/${encodeURIComponent(salaId)}/invitaciones`, {
    method: "POST",
    body: JSON.stringify({ emails }),
  });
}

/** Vista previa pública: no consume el token. Falla con code INVITATION_INVALID (410). */
export function getInvitacion(token: string): Promise<InvitacionPreview> {
  return request<InvitacionPreview>(`/invitaciones/${encodeURIComponent(token)}`);
}

/**
 * Acepta la invitación (INVITADO → PENDIENTE). Sesión opcional: `request` adjunta
 * el Bearer del usuario si existe. Sin cuenta: nombre y apellido obligatorios.
 */
export function aceptarInvitacion(
  token: string,
  body?: { nombre?: string; apellido?: string },
): Promise<AceptarInvitacionResponse> {
  return request<AceptarInvitacionResponse>(
    `/invitaciones/${encodeURIComponent(token)}/aceptar`,
    { method: "POST", body: JSON.stringify(body ?? {}) },
  );
}
