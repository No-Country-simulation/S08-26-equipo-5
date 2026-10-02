"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getParticipantes, getRealtimeUrl } from "./salas-api";
import { getAccessToken } from "./auth";

export type JoinRequest = {
  participanteId: string;
  // null en invitados por correo que aún no completaron sus datos (contrato PR #104).
  nombre: string | null;
  apellido: string | null;
  email: string;
  timestamp: string;
  /** optimistic UI state while the host is deciding */
  status: "pending" | "approving" | "rejecting" | "approved" | "rejected";
};

type JoinPendingPayload = {
  participanteId: string;
  // null en invitados por correo que aún no completaron sus datos (contrato PR #104).
  nombre: string | null;
  apellido: string | null;
  email: string;
  timestamp: string;
};

type SocketAck = {
  ok?: boolean;
  error?: { code?: string; message?: string };
};

type UseHostSocketOptions = {
  /** Código de la sala (e.g. "SAL-8M4Q7Z"). Pass null/undefined to skip. */
  salaCodigo: string | null | undefined;
  salaId: string | null | undefined;
  /** JWT access token for socket authentication */
  accessToken?: string | null;
};

type UseHostSocketReturn = {
  requests: JoinRequest[];
  approve: (participanteId: string) => void;
  reject: (participanteId: string) => void;
  connected: boolean;
  error: string;
};

/**
 * Hook para el HOST — se conecta al namespace /reuniones y gestiona
 * las solicitudes de ingreso en tiempo real (join:pending → approve/reject).
 */
export function useHostSocket({
  salaCodigo,
  salaId,
  accessToken,
}: UseHostSocketOptions): UseHostSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!salaCodigo || !salaId) return;

    const socket = io(`${getRealtimeUrl()}/reuniones`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: accessToken ?? getAccessToken() ?? "" },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError("");
      socket.emit(
        "host:subscribe",
        { salaId },
        (ack: SocketAck) => {
          if (!ack?.ok) {
            setError(ack?.error?.message ?? "No se pudo suscribir a la sala.");
            return;
          }

          void getParticipantes(salaId)
            .then(({ participantes }) => {
              setRequests((prev) => {
                const existing = new Set(prev.map((item) => item.participanteId));
                const pending = participantes
                  .filter((item) => item.estado === "PENDIENTE")
                  .filter((item) => !existing.has(item.id))
                  .map((item) => ({
                    participanteId: item.id,
                    nombre: item.nombre,
                    apellido: item.apellido,
                    email: item.email ?? "",
                    timestamp: item.fechaIngreso ?? new Date().toISOString(),
                    status: "pending" as const,
                  }));
                return [...prev, ...pending];
              });
            })
            .catch((requestError: unknown) => {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "No se pudieron recuperar las solicitudes pendientes.",
              );
            });
        },
      );
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setRequests((prev) =>
        prev.map((request) =>
          request.status === "approving" || request.status === "rejecting"
            ? { ...request, status: "pending" }
            : request,
        ),
      );
    });
    socket.on("connect_error", (socketError: Error) => {
      setError(socketError.message || "No se pudo conectar con la sala.");
    });
    socket.on("error", (payload: { message?: string }) => {
      setError(payload.message ?? "Ocurrió un error en la sala.");
    });

    socket.on("join:pending", (payload: JoinPendingPayload) => {
      setError("");
      setRequests((prev) => {
        if (prev.some((r) => r.participanteId === payload.participanteId)) {
          return prev;
        }
        return [
          ...prev,
          {
            participanteId: payload.participanteId,
            nombre: payload.nombre,
            apellido: payload.apellido,
            email: payload.email,
            timestamp: payload.timestamp ?? new Date().toISOString(),
            status: "pending",
          },
        ];
      });

      // Visual + audio notification
      try {
        const audio = new Audio(
          "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA" +
            "EAAQAARKwAAIhYAQACABAAZGF0YQoGAACBhYqFbF1fdJivrJBh" +
            "SF5pgJKijH9vZm9+jZaTjIZ9eHyFj5OSkYqEgH+Bh4uMioeEg4" +
            "OFiImIh4aFhoaHh4eHh4eHiIiIiIiIiA=="
        );
        void audio.play().catch(() => {
          // Autoplay restrictions should not prevent the request from appearing.
        });
      } catch {
        // Audio notification is optional; the request remains visible.
      }
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [salaCodigo, salaId, accessToken]);

  const resolveRequest = useCallback(
    (
      participanteId: string,
      action: "participant:approve" | "participant:reject",
    ) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("No hay conexión con la sala. Intentá nuevamente.");
        return;
      }

      const isApproval = action === "participant:approve";
      setError("");
      setRequests((prev) =>
        prev.map((request) =>
          request.participanteId === participanteId
            ? { ...request, status: isApproval ? "approving" : "rejecting" }
            : request,
        ),
      );

      socket.emit(action, { participanteId }, (ack: SocketAck) => {
        if (ack?.ok) {
          setRequests((prev) =>
            prev.map((request) =>
              request.participanteId === participanteId
                ? { ...request, status: isApproval ? "approved" : "rejected" }
                : request,
            ),
          );
          return;
        }

        if (ack?.error?.code === "PARTICIPANT_STATE_CONFLICT") {
          setRequests((prev) =>
            prev.filter((request) => request.participanteId !== participanteId),
          );
          return;
        }

        setRequests((prev) =>
          prev.map((request) =>
            request.participanteId === participanteId
              ? { ...request, status: "pending" }
              : request,
          ),
        );
        setError(ack?.error?.message ?? "No se pudo resolver la solicitud.");
      });
    },
    [],
  );

  const approve = useCallback(
    (participanteId: string) =>
      resolveRequest(participanteId, "participant:approve"),
    [resolveRequest],
  );
  const reject = useCallback(
    (participanteId: string) =>
      resolveRequest(participanteId, "participant:reject"),
    [resolveRequest],
  );

  return { requests, approve, reject, connected, error };
}
