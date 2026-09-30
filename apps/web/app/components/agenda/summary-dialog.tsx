"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  formatDuration,
  formatFullDate,
  formatTime,
  getDurationMinutes,
  type Meeting,
} from "../../lib/agenda";
import { getSalaDetalle, type SalaDetalle } from "../../lib/salas-api";
import { Dialog } from "./dialog";
import { StatusBadge } from "./status-badge";
import { btnPrimary, btnSecondary } from "./ui";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; detail: SalaDetalle };

export function SummaryDialog({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const titleId = useId();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    getSalaDetalle(meeting.id)
      .then((detail) => active && setState({ status: "ready", detail }))
      .catch(
        (error) =>
          active &&
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "No se pudo cargar el detalle de la reunión.",
          }),
      );
    return () => {
      active = false;
    };
  }, [meeting.id, attempt]);

  const minutes = getDurationMinutes(meeting);
  const timeRange = meeting.endAt
    ? `${formatTime(meeting.startAt)} - ${formatTime(meeting.endAt)}`
    : formatTime(meeting.startAt);

  return (
    <Dialog titleId={titleId} onClose={onClose} className="max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="min-w-0 break-words text-2xl font-bold leading-8">
          {meeting.title}
        </h2>
        <StatusBadge status={meeting.status} />
      </div>

      <dl className="mt-6 grid gap-x-6 gap-y-4 text-base sm:grid-cols-2">
        <div>
          <dt className="text-sm text-mf-muted">Fecha y hora</dt>
          <dd className="font-bold">{formatFullDate(meeting.startAt)}</dd>
          <dd>{timeRange}</dd>
        </div>
        <div>
          <dt className="text-sm text-mf-muted">Duración</dt>
          <dd className="font-bold">{minutes === null ? "No disponible" : formatDuration(minutes)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-mf-muted">Descripción</dt>
          <dd className="whitespace-pre-wrap break-words">
            {meeting.description?.trim() || "Sin descripción"}
          </dd>
        </div>
      </dl>

      <section aria-labelledby={`${titleId}-people`} className="mt-6">
        <h3 id={`${titleId}-people`} className="text-lg font-bold leading-7">
          Participantes
          {state.status === "ready" && (
            <span className="ml-2 font-normal text-mf-muted">({state.detail.participantes.length})</span>
          )}
        </h3>

        {state.status === "loading" && (
          <ul role="status" aria-label="Cargando participantes" className="mt-3 space-y-2">
            {[0, 1, 2].map((key) => (
              <li key={key} className="mf-skeleton h-11 rounded-xl bg-mf-light" />
            ))}
          </ul>
        )}

        {state.status === "error" && (
          <div role="alert" className="mt-3 rounded-xl bg-mf-coral-tint p-4 text-sm text-[#b63d4a]">
            <p>{state.message}</p>
            <button type="button" onClick={retry} className={`${btnSecondary} mt-3 h-10 text-sm`}>
              Reintentar
            </button>
          </div>
        )}

        {state.status === "ready" &&
          (state.detail.participantes.length === 0 ? (
            <p className="mt-3 text-mf-muted">Nadie ingresó a esta reunión.</p>
          ) : (
            <ul className="mt-3 divide-y divide-mf-line rounded-xl border border-mf-line">
              {state.detail.participantes.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="min-w-0 truncate font-bold">
                    {person.nombre} {person.apellido}
                    {person.rol === "HOST" && (
                      <span className="ml-2 rounded-md bg-mf-blue-tint px-2 py-0.5 text-xs font-bold text-mf-blue">
                        Host
                      </span>
                    )}
                  </span>
                  <span className="hidden min-w-0 truncate text-sm text-mf-muted sm:block">
                    {person.email}
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <div className="mt-8 flex justify-end">
        <button type="button" onClick={onClose} className={`${btnPrimary} h-12`}>
          Cerrar
        </button>
      </div>
    </Dialog>
  );
}
