import { Server, Socket } from 'socket.io';

export function setupReunionesSocket(io: Server): void {
    // * Namespace de WebSockets exigido por el contrato: '/reuniones'
    const reunionesNamespace = io.of('/reuniones');

    reunionesNamespace.on('connection', (socket: Socket) => {
        console.log(`[WebSocket] Cliente conectado al namespace /reuniones con ID: ${socket.id}`);

        // * Evento de prueba inicial para validar el canal (Criterio de Aceptación)
        socket.emit('test_connection', {
            message: 'Canal de WebSockets operativo en /reuniones',
            socketId: socket.id
        });

        socket.on('disconnect', () => {
            console.log(`[WebSocket] Cliente desconectado: ${socket.id}`);
        });
    });
}