import { Namespace, Socket } from "socket.io";
import { EstadoParticipante } from "@prisma/client";
import { AppError } from "../utils/AppError.js";
import {
    broadcastResolution,
    requestJoin,
    resolveParticipant,
    validateJoinInput,
    type WaitingRoomDeps,
} from "../services/waitingRoom.service.js";
import { rooms } from "./registry.js";

interface JoinRequestPayload {
    salaCodigo: string;
    nombre: string;
    apellido: string;
    email: string;
}
interface ParticipantActionPayload {
    participanteId: string;
}

type Ack = ((response: unknown) => void) | undefined;

/** Traduce cualquier error a la forma { code, message } que espera el cliente. */
function emitError(socket: Socket, error: unknown, ack?: Ack) {
    const payload =
        error instanceof AppError
            ? { code: error.code, message: error.message }
            : {
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Ocurrió un error interno",
              };

    if (!(error instanceof AppError)) {
        console.error("[waitingRoom]", error);
    }

    socket.emit("error", payload);
    ack?.({ ok: false, error: payload });
}

export function registerWaitingRoomHandlers(
    _nsp: Namespace,
    socket: Socket & {
        data: { userId?: string; participanteId?: string };
    },
    deps: WaitingRoomDeps
) {
    const { participantes } = deps;

    socket.on("join:request", async (payload: JoinRequestPayload, ack?: Ack) => {
        try {
            // Misma validación que POST /salas/:code/join (mismos códigos de
            // error): sin esto, un payload con campos vacíos o un email
            // inválido llegaba directo a requestJoin y creaba un Participante
            // con datos basura.
            const validado = validateJoinInput(payload ?? {});

            const result = await requestJoin(deps, {
                salaCodigo: validado.salaCodigo,
                nombre: validado.nombre,
                apellido: validado.apellido,
                email: validado.email,
                usuarioId: socket.data.userId ?? null,
            });

            // El socket se suscribe a sus rooms: sin esto join:approved
            // no tiene a dónde llegar.
            socket.join(rooms.participante(result.participanteId));
            socket.join(rooms.sala(result.salaId));

            ack?.({ ok: true, ...result });

            // Si ya estaba aprobado (reingreso tras recargar), devolvemos el
            // estado por el mismo evento que espera el cliente.
            if (result.estado === EstadoParticipante.APROBADO) {
                socket.emit("join:approved", {
                    participanteId: result.participanteId,
                    accessToken: result.accessToken,
                    sala: { id: result.salaId },
                    streamCallId: result.stream?.callId ?? null,
                    stream: result.stream ?? null,
                });
            }
        } catch (error) {
            emitError(socket, error, ack);
        }
    });

    /**
     * Permite que un participante ya dado de alta (por HTTP, por ejemplo)
     * se suscriba a sus rooms sin volver a crear el registro.
     *
     * OJO: acá se entrega join:approved (con el accessToken del invitado) a
     * quien esté en el room `participante:<id>`. Sin este chequeo, cualquier
     * socket podía mandar un participanteId ajeno y quedarse escuchando la
     * credencial de otra persona. Solo puede suscribirse:
     *   - el propio invitado (su guest JWT trae `socket.data.participanteId`), o
     *   - el usuario logueado dueño de ese participante (`participante.usuarioId`).
     */
    socket.on(
        "join:subscribe",
        async ({ participanteId }: ParticipantActionPayload, ack?: Ack) => {
            try {
                const participante = await participantes.findById(participanteId);
                if (!participante) {
                    throw new AppError(
                        404,
                        "NOT_FOUND",
                        "Participante no encontrado"
                    );
                }

                const esDueño =
                    (socket.data.participanteId !== undefined &&
                        socket.data.participanteId === participante.id) ||
                    (socket.data.userId !== undefined &&
                        socket.data.userId === participante.usuarioId);

                if (!esDueño) {
                    throw new AppError(
                        403,
                        "FORBIDDEN",
                        "No podés suscribirte a este participante"
                    );
                }

                socket.join(rooms.participante(participante.id));
                socket.join(rooms.sala(participante.sala.id));
                ack?.({ ok: true, estado: participante.estado });
            } catch (error) {
                emitError(socket, error, ack);
            }
        }
    );

    socket.on("host:subscribe", async ({ salaId }: { salaId: string }, ack?: Ack) => {
        try {
            if (!socket.data.userId) {
                throw new AppError(
                    401,
                    "UNAUTHORIZED",
                    "Token ausente, inválido o expirado"
                );
            }

            const esHost = await participantes.findHost(salaId, socket.data.userId);
            if (!esHost) {
                throw new AppError(
                    403,
                    "HOST_ONLY",
                    "Solo el HOST puede suscribirse"
                );
            }

            socket.join(rooms.salaHost(salaId));
            socket.join(rooms.sala(salaId));
            ack?.({ ok: true });
        } catch (error) {
            emitError(socket, error, ack);
        }
    });

    socket.on("participant:approve", (payload: ParticipantActionPayload, ack?: Ack) =>
        handleResolution(socket, deps, payload, EstadoParticipante.APROBADO, ack)
    );

    socket.on("participant:reject", (payload: ParticipantActionPayload, ack?: Ack) =>
        handleResolution(socket, deps, payload, EstadoParticipante.RECHAZADO, ack)
    );
}

async function handleResolution(
    socket: Socket & { data: { userId?: string } },
    deps: WaitingRoomDeps,
    payload: ParticipantActionPayload,
    nuevoEstado: EstadoParticipante,
    ack?: Ack
) {
    try {
        if (!socket.data.userId) {
            throw new AppError(
                401,
                "UNAUTHORIZED",
                "Token ausente, inválido o expirado"
            );
        }

        const result = await resolveParticipant(deps, {
            participanteId: payload.participanteId,
            hostUsuarioId: socket.data.userId,
            nuevoEstado,
        });

        await broadcastResolution(deps, result);
        ack?.({ ok: true, estado: nuevoEstado });
    } catch (error) {
        emitError(socket, error, ack);
    }
}
