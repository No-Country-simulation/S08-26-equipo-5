export type Sala = {
  id: string;
  codigo: string;
  nombre: string;
  resumen?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  estado: string;
};

export type JoinParticipantResponse = {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  message?: string;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function getRealtimeUrl() {
  return new URL(API_URL).origin;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
  return request<Sala>("/salas", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSalaByCode(code: string): Promise<Sala> {
  return request<Sala>(`/salas/${encodeURIComponent(code)}`);
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
