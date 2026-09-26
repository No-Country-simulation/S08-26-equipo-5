import type { Namespace } from "socket.io";

/**
 * Registro del namespace /reuniones.
 *
 * Los controllers HTTP también necesitan avisar por socket (por ejemplo,
 * POST /salas/:code/join tiene que emitir join:pending al host), pero no
 * pueden importar el servidor de sockets sin crear un ciclo con app.ts.
 * Este registro lo resuelve: server.ts lo setea al arrancar y queda en null
 * en los tests, donde createApp() corre sin Socket.IO.
 */
let reunionesNamespace: Namespace | null = null;

export function setReunionesNamespace(nsp: Namespace): void {
  reunionesNamespace = nsp;
}

export function getReunionesNamespace(): Namespace | null {
  return reunionesNamespace;
}

/** Rooms de Socket.IO usados por el flujo de sala de espera. */
export const rooms = {
  /** Sockets del participante concreto (recibe join:approved / join:rejected). */
  participante: (participanteId: string) => `participante:${participanteId}`,
  /** Todos los sockets de la sala (recibe room:state). */
  sala: (salaId: string) => `sala:${salaId}`,
  /** Sockets del host de la sala (recibe join:pending). */
  salaHost: (salaId: string) => `sala:${salaId}:host`,
};
