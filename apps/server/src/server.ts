import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { setupReunionesSocket } from "./sockets/reuniones.socket.js";

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.corsOrigin,
    methods: ["GET", "POST"],
  },
});

setupReunionesSocket(io);

server.listen(env.port, () => {
  console.log(`[Server] MeetFlow API listening on http://localhost:${env.port}`);
  console.log(`[WebSocket] Namespace /reuniones on ws://localhost:${env.port}/reuniones`);
});
