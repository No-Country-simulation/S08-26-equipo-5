import type { Server, Socket } from "socket.io";

export function setupReunionesSocket(io: Server): void {
  const reunionesNamespace = io.of("/reuniones");

  reunionesNamespace.on("connection", (socket: Socket) => {
    console.log(`[WebSocket] Cliente conectado a /reuniones: ${socket.id}`);

    socket.emit("test_connection", {
      message: "Canal de WebSockets operativo en /reuniones",
      socketId: socket.id,
    });

    socket.on("disconnect", () => {
      console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
    });
  });
}
