import type { RoomRole } from "./stream.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
      };
      /**
       * Contexto resuelto por el middleware authParticipante.
       * Sirve tanto para un usuario registrado como para un invitado
       * que presenta su guest JWT.
       */
      participante?: {
        participanteId: string;
        salaId: string;
        rol: RoomRole;
        estado: string;
        nombre: string | null;
        apellido: string | null;
        email: string;
        /** true si la credencial usada fue un guest JWT. */
        esInvitado: boolean;
      };
    }
  }
}

export {};
