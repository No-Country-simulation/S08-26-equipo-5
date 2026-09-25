"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMisParticipaciones, type SalaResumen } from "../lib/salas-api";

type MeetingStatus = "completed" | "scheduled" | "in_progress";
type AgendaFilter = "all" | "upcoming" | "past";

type Meeting = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: MeetingStatus;
  roomCode: string;
  salaId: string;
  role: "HOST" | "PARTICIPANTE";
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

function isPast(meeting: Meeting) {
  return meeting.status === "completed";
}

function toMeeting(sala: SalaResumen): Meeting {
  const status: MeetingStatus =
    sala.estado === "FINALIZADA" || sala.estado === "CANCELADA"
      ? "completed"
      : sala.estado === "ACTIVA"
        ? "in_progress"
        : "scheduled";

  return {
    id: sala.id,
    title: sala.nombre,
    description: sala.resumen ?? "Sin descripción",
    startAt: sala.fechaInicio,
    endAt: sala.fechaFin ?? sala.fechaInicio,
    status,
    roomCode: sala.codigo,
    salaId: sala.id,
    role: sala.rol,
  };
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value)).replace(".", "");
}

function formatTimeRange(meeting: Meeting) {
  return `${timeFormatter.format(new Date(meeting.startAt))} - ${timeFormatter.format(
    new Date(meeting.endAt),
  )}`;
}

function getJoinHref(meeting: Meeting) {
  if (meeting.role === "HOST") {
    return `/room?code=${encodeURIComponent(meeting.roomCode)}&host=true&salaId=${encodeURIComponent(meeting.salaId)}`;
  }

  const destination = meeting.status === "in_progress" ? "room" : "waiting-room";
  return `/${destination}?code=${encodeURIComponent(meeting.roomCode)}`;
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  const labels = {
    completed: "Finalizada",
    scheduled: "Programada",
    in_progress: "En curso",
  };
  const colors = {
    completed: "bg-slate-100 text-slate-600",
    scheduled: "bg-blue-50 text-blue-700",
    in_progress: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

export function AgendaTable() {
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void getMisParticipaciones()
      .then(({ salas }) => {
        if (active) setMeetings(salas.map(toMeeting));
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "No se pudieron cargar tus reuniones.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const nextMeeting = useMemo(
    () => meetings.find((meeting) => !isPast(meeting)),
    [],
  );

  const filteredMeetings = useMemo(() => {
    return meetings.filter((meeting) => {
      if (filter === "upcoming") return !isPast(meeting);
      if (filter === "past") return isPast(meeting);
      return true;
    });
  }, [filter]);

  return (
    <section aria-labelledby="agenda-title" className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Agenda
          </p>
          <h2 id="agenda-title" className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Tus reuniones
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Consultá tus reuniones próximas y las que ya terminaron.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1" role="group" aria-label="Filtrar agenda">
          {([
            ["all", "Todas"],
            ["upcoming", "Próximas"],
            ["past", "Pasadas"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                filter === value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Cargando tus reuniones…
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {nextMeeting && filter !== "past" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
              Próxima reunión
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">{nextMeeting.title}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {formatDate(nextMeeting.startAt)} · {formatTimeRange(nextMeeting)}
            </p>
          </div>
          <Link
            href={getJoinHref(nextMeeting)}
            className="mt-4 inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:mt-0"
          >
            Ingresar a la sala
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-4 font-semibold">Reunión</th>
                <th scope="col" className="px-5 py-4 font-semibold">Fecha y hora</th>
                <th scope="col" className="px-5 py-4 font-semibold">Estado</th>
                <th scope="col" className="px-5 py-4 text-right font-semibold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMeetings.map((meeting) => (
                <tr key={meeting.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{meeting.title}</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">{meeting.description}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                    <p className="font-medium capitalize">{formatDate(meeting.startAt)}</p>
                    <p className="mt-1 text-slate-500">{formatTimeRange(meeting)}</p>
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={meeting.status} /></td>
                  <td className="px-5 py-4 text-right">
                    {meeting.status === "completed" ? (
                      <span className="text-sm text-slate-400">Sin acciones</span>
                    ) : (
                      <Link
                        href={getJoinHref(meeting)}
                        className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        Ingresar
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredMeetings.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-500">
            No hay reuniones en este filtro.
          </p>
        )}
      </div>
    </section>
  );
}
