import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createReunionesNamespace } from "./realtime/reuniones.namespace.js";

const app = createApp();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: env.corsOrigin, credentials: true },
});

createReunionesNamespace(io);

httpServer.listen(env.port, () => {
  console.log(`[Server] MeetFlow API listening on http://localhost:${env.port}`);
  console.log(`[Server] Socket.io namespace /reuniones activo`);
});
