import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { env } from './config/env'; // Usando tu config validada
import { healthRoutes } from './routes/health.routes';
import { setupReunionesSocket } from './sockets/reuniones.socket';
import { errorMiddleware } from './middlewares/error.middleware';

const app = express();
const server = http.createServer(app);

// * Configuración de Socket.io acoplado al servidor HTTP
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// * Middlewares base de Express
app.use(cors());
app.use(express.json());

// * Enrutador principal de la API v1
app.use('/api/v1', healthRoutes);

// * Inicialización de WebSockets
setupReunionesSocket(io);

// * Middleware global de errores (Siempre al final de las rutas)
app.use(errorMiddleware);

// * Arranque del servidor usando el puerto de la config tipada
const PORT = env.port || 4000;

server.listen(PORT, () => {
  console.log(`[Server] Servidor HTTP corriendo en http://localhost:${PORT}`);
  console.log(`[WebSocket] Namespace activo en ws://localhost:${PORT}/reuniones`);
});