export type RoomRole = "HOST" | "PARTICIPANTE";
export type EstadoSala = "PROGRAMADA" | "ACTIVA" | "FINALIZADA" | "CANCELADA";

// ─── GET /salas/mis-participaciones ────────────────────────
export interface SalaResumen {
  id: string;
  codigo: string;
  nombre: string;
  resumen: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoSala;
  totalParticipantes: number;
  rol: RoomRole;
}

// ─── POST /salas ─────────────────────────────────────────
export interface CreateSalaBody {
  nombre: string;
  resumen?: string;
  fechaInicio?: string; // ISO date, default: now
}

export interface CreateSalaResponse {
  salaId: string;
  codigo: string;
  nombre: string;
  enlace: string;
  /** CID completo "<type>:<id>". */
  streamRoomId: string;
  stream: StreamCallRef;
}

/**
 * Referencia al call de GetStream. El SDK del cliente necesita type e id
 * por separado: `client.call(callType, callId)`.
 */
export interface StreamCallRef {
  callType: string;
  callId: string;
  callCid: string;
}

// ─── GET /salas/:code ────────────────────────────────────
export interface SalaPublica {
  id: string;
  codigo: string;
  nombre: string;
  resumen: string | null;
  fechaInicio: string;
  estado: string;
  totalParticipantes: number;
}

// ─── GET /salas/:id/detalle ──────────────────────────────
export interface SalaDetalle {
  id: string;
  codigo: string;
  nombre: string;
  resumen: string | null;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoSala;
  streamRoomId: string | null;
  stream: StreamCallRef | null;
  enlace: string;
  totalParticipantes: number;
  participantes: ParticipanteInfo[];
  creador: CreadorInfo;
}

export interface ParticipanteInfo {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  rol: RoomRole;
  estado: string;
  fechaIngreso: string | null;
}

export interface CreadorInfo {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
}

// ─── PUT /salas/:id ──────────────────────────────────────
export interface UpdateSalaBody {
  nombre?: string;
  resumen?: string;
  fechaInicio?: string;
}

export interface UpdateSalaResponse {
  id: string;
  codigo: string;
  nombre: string;
  resumen: string | null;
  fechaInicio: string;
}

// ─── GET /salas/:id/participantes ────────────────────────
export interface ParticipantesResponse {
  salaId: string;
  salaNombre: string;
  total: number;
  participantes: ParticipanteInfo[];
}

// ─── POST /salas/:id/transfer-host ───────────────────────
export interface TransferHostBody {
  nuevoHostId: string;
}

export interface TransferHostResponse {
  message: string;
  host: { usuarioId: string };
  previousHost: { usuarioId: string };
}

// ─── POST /salas/:code/join ──────────────────────────────
export interface JoinSalaBody {
  nombre: string;
  apellido: string;
  email: string;
}

export interface JoinSalaResponse {
  participanteId: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  salaId: string;
  /** Guest JWT. Solo presente si el participante ya está aprobado. */
  accessToken?: string;
  stream?: StreamCallRef;
}

// ─── POST /salas/:salaId/stream-token ────────────────────
// También es la respuesta de POST /rooms/:id/token (legacy, deprecated):
// ese endpoint es un alias que delega en la misma lógica, así que reutiliza
// este mismo tipo en vez de duplicarlo.
export interface StreamTokenResponse {
  /** API key pública de GetStream: el cliente la necesita para el SDK. */
  apiKey: string;
  /** Token de GetStream, restringido a este call. */
  token: string;
  /** user_id en GetStream (= Participante.id). */
  userId: string;
  user: { id: string; name: string };
  rol: RoomRole;
  callType: string;
  callId: string;
  callCid: string;
  sala: { id: string; codigo: string; nombre: string; estado: string };
  expiresAt: string;
}

// ─── GET /salas/:salaId/mi-estado ────────────────────────
export interface MiEstadoResponse {
  participanteId: string;
  estado: string;
  rol: RoomRole;
  sala: { id: string; codigo: string; nombre: string; estado: string };
  /** null mientras el participante no esté aprobado. */
  stream: StreamCallRef | null;
}

// ─── Errores ─────────────────────────────────────────────
export interface ErrorResponse {
  error: string;
  details?: string;
}