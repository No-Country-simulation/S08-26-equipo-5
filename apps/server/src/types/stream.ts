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
  streamRoomId: string;
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

// ─── POST /rooms/:id/token (legacy) ──────────────────────
// El body ya no se usa: userId sale del JWT y el rol de la DB.
export interface GenerateTokenResponse {
  token: string;
}

// ─── Errores ─────────────────────────────────────────────
export interface ErrorResponse {
  error: string;
  details?: string;
}