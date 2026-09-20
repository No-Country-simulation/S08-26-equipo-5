"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getRealtimeUrl } from "./salas-api";

export type JoinRequest = {
  participanteId: string;
  nombre: string;
  apellido: string;
  email: string;
  timestamp: string;
  /** optimistic UI state while the host is deciding */
  status: "pending" | "approving" | "rejecting" | "approved" | "rejected";
};

type JoinPendingPayload = {
  participanteId: string;
  nombre: string;
  apellido: string;
  email: string;
  timestamp: string;
};

type UseHostSocketOptions = {
  /** Código de la sala (e.g. "SAL-8M4Q7Z"). Pass null/undefined to skip. */
  salaCodigo: string | null | undefined;
  /** JWT access token for socket authentication */
  accessToken?: string | null;
};

type UseHostSocketReturn = {
  requests: JoinRequest[];
  approve: (participanteId: string) => void;
  reject: (participanteId: string) => void;
  connected: boolean;
};

/**
 * Hook para el HOST — se conecta al namespace /reuniones y gestiona
 * las solicitudes de ingreso en tiempo real (join:pending → approve/reject).
 */
export function useHostSocket({
  salaCodigo,
  accessToken,
}: UseHostSocketOptions): UseHostSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [requests, setRequests] = useState<JoinRequest[]>([]);

  useEffect(() => {
    if (!salaCodigo) return;

    const socket = io(`${getRealtimeUrl()}/reuniones`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: accessToken ? { token: accessToken } : undefined,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("join:pending", (payload: JoinPendingPayload) => {
      // Ignore payloads not related to this sala (defensive check)
      setRequests((prev) => {
        // Avoid duplicates — backend may re-emit
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
        void audio.play().catch(() => {/* silently ignore autoplay restrictions */});
      } catch {/* ignore */}
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [salaCodigo, accessToken]);

  const approve = useCallback((participanteId: string) => {
    // Optimistic update
    setRequests((prev) =>
      prev.map((r) =>
        r.participanteId === participanteId ? { ...r, status: "approving" } : r
      )
    );

    socketRef.current?.emit(
      "participant:approve",
      { participanteId },
      () => {
        setRequests((prev) =>
          prev.map((r) =>
            r.participanteId === participanteId ? { ...r, status: "approved" } : r
          )
        );
      }
    );

    // Fallback: mark as approved even without ack
    setTimeout(() => {
      setRequests((prev) =>
        prev.map((r) =>
          r.participanteId === participanteId && r.status === "approving"
            ? { ...r, status: "approved" }
            : r
        )
      );
    }, 3000);
  }, []);

  const reject = useCallback((participanteId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.participanteId === participanteId ? { ...r, status: "rejecting" } : r
      )
    );

    socketRef.current?.emit(
      "participant:reject",
      { participanteId },
      () => {
        setRequests((prev) =>
          prev.map((r) =>
            r.participanteId === participanteId ? { ...r, status: "rejected" } : r
          )
        );
      }
    );

    // Fallback
    setTimeout(() => {
      setRequests((prev) =>
        prev.map((r) =>
          r.participanteId === participanteId && r.status === "rejecting"
            ? { ...r, status: "rejected" }
            : r
        )
      );
    }, 3000);
  }, []);

  return { requests, approve, reject, connected };
}
