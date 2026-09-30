"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { getMisParticipaciones, getSalaDetalle, updateSala, type SalaResumen, type SalaDetalle } from "../lib/salas-api";

type MeetingStatus = "completed" | "scheduled" | "in_progress";

type Meeting = {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  status: MeetingStatus;
  isFinalized: boolean;
  roomCode: string;
  salaId: string;
  role: "HOST" | "PARTICIPANTE";
  totalParticipantes: number;
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
    description: sala.resumen,
    startAt: sala.fechaInicio,
    endAt: sala.fechaFin ?? sala.fechaInicio,
    status,
    isFinalized: sala.estado === "FINALIZADA",
    roomCode: sala.codigo,
    salaId: sala.id,
    role: sala.rol,
    totalParticipantes: sala.totalParticipantes,
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

function isJoinable(meeting: Meeting) {
  if (meeting.status === "completed") return false;
  if (meeting.status === "in_progress") return true;
  
  const start = new Date(meeting.startAt).getTime();
  const now = Date.now();
  const minutesLeft = (start - now) / (1000 * 60);
  
  return minutesLeft <= 10;
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

export function ExpandablePastMeetingRow({
  meeting,
  onMeetingUpdated,
}: {
  meeting: Meeting;
  onMeetingUpdated: (salaId: string, nombre: string, resumen: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detalle, setDetalle] = useState<SalaDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const handleExpand = async () => {
    if (!expanded && !detalle && !loading) {
      setLoading(true);
      try {
        const data = await getSalaDetalle(meeting.id);
        setDetalle(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar el detalle");
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditError("");
    if (!editTitle.trim()) {
      setEditError("El título no puede estar vacío.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateSala(meeting.salaId, {
        nombre: editTitle.trim(),
        resumen: editDescription.trim() || null,
      });
      onMeetingUpdated(meeting.salaId, updated.nombre, updated.resumen);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "No se pudo actualizar la reunión.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className="transition-colors hover:bg-slate-50 cursor-pointer" onClick={handleExpand}>
        <td className="px-5 py-4">
          <p className="font-semibold text-slate-950">{meeting.title}</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">{meeting.description ?? "Sin descripción"}</p>
        </td>
        <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
          <p className="font-medium capitalize">{formatDate(meeting.startAt)}</p>
          <p className="mt-1 text-slate-500">{formatTimeRange(meeting)}</p>
        </td>
        <td className="px-5 py-4">
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
            {meeting.totalParticipantes} {meeting.totalParticipantes === 1 ? 'persona' : 'personas'}
          </span>
        </td>
        <td className="px-5 py-4 text-right">
          <div className="inline-flex items-center gap-2">
            {meeting.role === "HOST" && meeting.isFinalized && (
              <button
                type="button"
                aria-label="Editar título y descripción"
                title="Editar título y descripción"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditTitle(meeting.title);
                  setEditDescription(meeting.description ?? "");
                  setEditError("");
                  setEditing(true);
                  setExpanded(true);
                }}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l2.651 2.651M8 16l8.5-8.5a1.875 1.875 0 112.652 2.652L10.65 18.65a4 4 0 01-1.694 1.006L6 20l.344-2.956A4 4 0 017.35 15.35z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
            >
              {expanded ? "Ocultar" : "Ver detalle"}
              <svg
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="p-0 border-b border-slate-100 bg-slate-50/50">
            <div className="px-5 py-6">
              {editing && (
                <form onSubmit={handleSave} className="mb-6 max-w-2xl rounded-xl border border-blue-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Editar reunión</h4>
                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Título
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      maxLength={150}
                      required
                      className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-950"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Descripción <span className="font-normal text-slate-500">(opcional)</span>
                    <textarea
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      rows={3}
                      className="mt-1.5 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-950"
                    />
                  </label>
                  {editError && <p role="alert" className="mt-3 text-sm text-red-600">{editError}</p>}
                  <div className="mt-4 flex gap-2">
                    <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                      {saving ? "Guardando…" : "Guardar cambios"}
                    </button>
                    <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
              {loading && <p className="text-sm text-slate-500">Cargando detalles...</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
              {detalle && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4">
                     <div>
                       <h4 className="text-sm font-semibold text-slate-900">Participantes que ingresaron</h4>
                       <ul className="mt-3 space-y-2">
                         {detalle.participantes.map(p => (
                           <li key={p.id} className="flex items-center justify-between text-sm gap-6">
                             <span className="text-slate-700 font-medium whitespace-nowrap">
                               {p.nombre} {p.apellido}
                               {p.rol === "HOST" && (
                                 <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                   Host
                                 </span>
                               )}
                             </span>
                             <span className="text-slate-500 truncate">{p.email}</span>
                           </li>
                         ))}
                       </ul>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AgendaTable() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Estado para forzar re-render de tiempo para el botón de ingresar
  const [, setNow] = useState(Date.now());

  const handleMeetingUpdated = (salaId: string, nombre: string, resumen: string | null) => {
    setMeetings((current) => current.map((meeting) =>
      meeting.salaId === salaId
        ? { ...meeting, title: nombre, description: resumen }
        : meeting,
    ));
  };

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

    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, 60000); // Check every minute to enable the "Ingresar" button

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  const nextMeeting = useMemo(
    () => meetings.find((meeting) => !isPast(meeting)),
    [meetings],
  );

  const upcomingMeetings = useMemo(() => meetings.filter(m => !isPast(m)), [meetings]);
  const pastMeetings = useMemo(() => meetings.filter(m => isPast(m)), [meetings]);

  return (
    <div className="space-y-12">
      <section aria-labelledby="upcoming-agenda-title" className="space-y-5">
        <div>
          <h2 id="upcoming-agenda-title" className="text-2xl font-bold tracking-tight text-slate-950">
            Próximas reuniones
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Consultá tus reuniones agendadas. El ingreso estará habilitado 10 minutos antes del inicio.
          </p>
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

        {nextMeeting && (
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
            {isJoinable(nextMeeting) ? (
              <Link
                href={getJoinHref(nextMeeting)}
                className="mt-4 inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:mt-0"
              >
                Ingresar a la sala
              </Link>
            ) : (
              <span className="mt-4 inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-100 px-4 py-2.5 text-sm font-semibold text-blue-400 sm:mt-0 cursor-not-allowed">
                Faltan más de 10 minutos
              </span>
            )}
          </div>
        )}

        {!loading && !error && upcomingMeetings.length > 0 && (
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
                  {upcomingMeetings.map((meeting) => (
                    <tr key={meeting.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-950">{meeting.title}</p>
                        <p className="mt-1 max-w-sm text-sm text-slate-500">{meeting.description ?? "Sin descripción"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                        <p className="font-medium capitalize">{formatDate(meeting.startAt)}</p>
                        <p className="mt-1 text-slate-500">{formatTimeRange(meeting)}</p>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={meeting.status} /></td>
                      <td className="px-5 py-4 text-right">
                        {isJoinable(meeting) ? (
                          <Link
                            href={getJoinHref(meeting)}
                            className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                          >
                            Ingresar
                          </Link>
                        ) : (
                          <span className="text-sm text-slate-400">En espera</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && upcomingMeetings.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 text-center">
            No tienes reuniones próximas.
          </p>
        )}
      </section>

      <section aria-labelledby="past-agenda-title" className="space-y-5">
        <div>
          <h2 id="past-agenda-title" className="text-2xl font-bold tracking-tight text-slate-950">
            Reuniones pasadas
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Revisá el historial y los detalles de las reuniones que ya finalizaron.
          </p>
        </div>

        {!loading && !error && pastMeetings.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-semibold">Reunión</th>
                    <th scope="col" className="px-5 py-4 font-semibold">Fecha y hora</th>
                    <th scope="col" className="px-5 py-4 font-semibold">Participantes</th>
                    <th scope="col" className="px-5 py-4 text-right font-semibold">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pastMeetings.map((meeting) => (
                    <ExpandablePastMeetingRow
                      key={meeting.id}
                      meeting={meeting}
                      onMeetingUpdated={handleMeetingUpdated}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && pastMeetings.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 text-center">
            No tienes reuniones pasadas registradas.
          </p>
        )}
      </section>
    </div>
  );
}

