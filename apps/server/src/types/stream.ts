export type RoomRole = "HOST" | "PARTICIPANTE";

export interface CreateRoomBody {
  name: string;
}

export interface GenerateTokenBody {
  userId: string;
  role: RoomRole;
  callCid: string;
}

export interface CreateRoomResponse {
  salaId: string;
  streamRoomId: string;
  name: string;
}

export interface GenerateTokenResponse {
  token: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
}