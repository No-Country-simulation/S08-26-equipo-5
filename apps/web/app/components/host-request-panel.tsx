"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { JoinRequest } from "../lib/host-socket";
import { displayName, initials } from "../lib/participant-name";

type HostRequestPanelProps = {
  requests: JoinRequest[];
  connected: boolean;
  error: string;
  onApprove: (participanteId: string) => void;
  onReject: (participanteId: string) => void;
};

// ... RequestCard function remains the same ...

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function RequestCard({
  request,
  connected,
  onApprove,
  onReject,
}: {
  request: JoinRequest;
  connected: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const cardRef = useRef<HTMLLIElement>(null);
  const isNew = request.status === "pending";

  // Scroll new card into view
  useEffect(() => {
    if (isNew && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isNew]);

  const isDeciding = request.status === "approving" || request.status === "rejecting";
  const isDone = request.status === "approved" || request.status === "rejected";

  return (
    <li
      ref={cardRef}
      role="article"
      aria-label={`Solicitud de ${displayName(request)}`}
      className={[
        "relative overflow-hidden rounded-xl border p-4 transition-all duration-300",
        request.status === "pending"
          ? "animate-[slideIn_0.3s_ease-out] border-blue-200 bg-blue-50 shadow-md shadow-blue-100"
          : request.status === "approving"
            ? "border-green-200 bg-green-50 opacity-80"
            : request.status === "rejecting"
              ? "border-red-200 bg-red-50 opacity-80"
              : request.status === "approved"
                ? "border-green-200 bg-green-50"
                : "border-slate-200 bg-slate-50 opacity-60",
      ].join(" ")}
    >
      {/* New indicator pulse */}
      {request.status === "pending" && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 flex h-2.5 w-2.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700"
        >
          {initials(request)}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-950">
            {displayName(request)}
          </p>
          {request.email && displayName(request) !== request.email && (
            <p className="truncate text-sm text-slate-500">{request.email}</p>
          )}
          <p className="mt-0.5 text-xs text-slate-400">
            {formatTime(request.timestamp)}
          </p>
        </div>
      </div>

      {/* Status / Actions */}
      {isDone ? (
        <p
          className={`mt-3 text-center text-sm font-semibold ${
            request.status === "approved" ? "text-green-700" : "text-slate-500"
          }`}
        >
          {request.status === "approved" ? "✓ Aprobado" : "✗ Rechazado"}
        </p>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            id={`approve-${request.participanteId}`}
            type="button"
            disabled={isDeciding || !connected}
            onClick={onApprove}
            aria-label={`Aprobar a ${displayName(request)}`}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
          >
            {request.status === "approving" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Aprobando…
              </span>
            ) : (
              "Aprobar"
            )}
          </button>
          <button
            id={`reject-${request.participanteId}`}
            type="button"
            disabled={isDeciding || !connected}
            onClick={onReject}
            aria-label={`Rechazar a ${displayName(request)}`}
            className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {request.status === "rejecting" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                Rechazando…
              </span>
            ) : (
              "Rechazar"
            )}
          </button>
        </div>
      )}
    </li>
  );
}

export function HostRequestPanel({
  requests,
  connected,
  error,
  onApprove,
  onReject,
}: HostRequestPanelProps) {
  const pending = requests.filter((r) => r.status === "pending" || r.status === "approving" || r.status === "rejecting");
  const done = requests.filter((r) => r.status === "approved" || r.status === "rejected");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const content = (
    <aside
      aria-label="Panel de solicitudes de ingreso"
      className={
        pending.length > 0
          ? "fixed bottom-6 right-6 z-[9999] w-full max-w-sm max-h-[80vh] flex flex-col rounded-2xl border border-blue-200 bg-white shadow-2xl animate-in slide-in-from-bottom-5"
          : "flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Anfitrión
          </p>
          <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
            Solicitudes de ingreso
          </h2>
        </div>

        {/* Connection indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-slate-300"}`}
          />
          <span className={connected ? "text-green-700" : "text-slate-400"}>
            {connected ? "En vivo" : "Conectando…"}
          </span>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Pending */}
      <div className="flex-1 overflow-y-auto p-4">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <svg
              aria-hidden="true"
              className="h-10 w-10 text-slate-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-400">
              Sin solicitudes pendientes
            </p>
            <p className="text-xs text-slate-300">
              Aparecerán aquí en tiempo real
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Solicitudes pendientes">
            {pending.map((r) => (
              <RequestCard
                key={r.participanteId}
                request={r}
                connected={connected}
                onApprove={() => onApprove(r.participanteId)}
                onReject={() => onReject(r.participanteId)}
              />
            ))}
          </ul>
        )}

        {/* Resolved (compact list) */}
        {done.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Historial de esta sesión
            </p>
            <ul className="space-y-1.5" aria-label="Solicitudes resueltas">
              {done.map((r) => (
                <li
                  key={r.participanteId}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span className="truncate text-sm text-slate-600">
                    {displayName(r)}
                  </span>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      r.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {r.status === "approved" ? "Aprobado" : "Rechazado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Pending count badge */}
      {pending.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3 text-center text-sm text-slate-500">
          <span className="font-semibold text-blue-600">{pending.length}</span>{" "}
          {pending.length === 1 ? "solicitud pendiente" : "solicitudes pendientes"}
        </div>
      )}
    </aside>
  );

  if (pending.length > 0) {
    if (!isMounted) return null;
    return createPortal(content, document.body);
  }

  return content;
}
