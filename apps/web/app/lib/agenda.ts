import type { SalaEstado, SalaResumen } from "./salas-api";

export type AgendaTab = "proximas" | "finalizadas";

export type Meeting = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  status: SalaEstado;
  role: "HOST" | "PARTICIPANTE";
  participants: number;
};

export const TAB_LABELS: Record<AgendaTab, string> = {
  proximas: "Próximas",
  finalizadas: "Finalizadas",
};

export function toMeeting(sala: SalaResumen): Meeting {
  return {
    id: sala.id,
    code: sala.codigo,
    title: sala.nombre,
    description: sala.resumen,
    startAt: sala.fechaInicio,
    endAt: sala.fechaFin,
    status: sala.estado,
    role: sala.rol,
    participants: sala.totalParticipantes,
  };
}

export function isUpcoming(meeting: Meeting) {
  return meeting.status === "PROGRAMADA" || meeting.status === "ACTIVA";
}

export function tabOf(meeting: Meeting): AgendaTab {
  return isUpcoming(meeting) ? "proximas" : "finalizadas";
}

/** Minutos antes del inicio desde los que un participante puede entrar. */
const JOIN_WINDOW_MINUTES = 10;

/**
 * Decisión de producto: el HOST siempre puede iniciar/entrar (él abre la sala).
 * Un PARTICIPANTE solo puede entrar si la sala está ACTIVA o faltan <= 10 min
 * (misma regla que tenía la antigua tabla de agenda).
 */
export function canJoin(meeting: Meeting, now = Date.now()) {
  if (!isUpcoming(meeting)) return false;
  if (meeting.role === "HOST") return true;
  if (meeting.status === "ACTIVA") return true;
  const minutesLeft = (new Date(meeting.startAt).getTime() - now) / 60000;
  return minutesLeft <= JOIN_WINDOW_MINUTES;
}

export function getJoinHref(meeting: Meeting) {
  const code = encodeURIComponent(meeting.code);
  if (meeting.role === "HOST") {
    return `/room?code=${code}&host=true&salaId=${encodeURIComponent(meeting.id)}`;
  }
  return `/${meeting.status === "ACTIVA" ? "room" : "waiting-room"}?code=${code}`;
}

/** Enlace público para compartir (la ruta /sala/[codigo] redirige a la sala de espera). */
export function getShareLink(meeting: Meeting) {
  return `${window.location.origin}/sala/${encodeURIComponent(meeting.code)}`;
}

// ── Fechas (siempre en la zona horaria del navegador) ────────────────────────

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const weekdayFormatter = new Intl.DateTimeFormat("es-AR", { weekday: "long" });
const monthFormatter = new Intl.DateTimeFormat("es-AR", { month: "long" });
const fullDateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Hoy, 30 de septiembre" / "Mañana, …" / "Ayer, …" / "Miércoles 1 de octubre". */
export function formatDayLabel(day: Date, today = new Date()) {
  const dayMonth = `${day.getDate()} de ${monthFormatter.format(day)}`;
  if (isSameDay(day, today)) return `Hoy, ${dayMonth}`;
  if (isSameDay(day, addDays(today, 1))) return `Mañana, ${dayMonth}`;
  if (isSameDay(day, addDays(today, -1))) return `Ayer, ${dayMonth}`;
  return `${capitalize(weekdayFormatter.format(day))} ${dayMonth}`;
}

export function formatTime(iso: string) {
  return timeFormatter.format(new Date(iso));
}

export function formatFullDate(iso: string) {
  return capitalize(fullDateFormatter.format(new Date(iso)));
}

/** Duración en minutos (mínimo 1) o null si la reunión no tiene fecha de fin. */
export function getDurationMinutes(meeting: Pick<Meeting, "startAt" | "endAt">) {
  if (!meeting.endAt) return null;
  const diff = new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime();
  return Math.max(1, Math.round(diff / 60000));
}

/** "30 minutos", "1 minuto", "2 h", "1 h 15 min". */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "4 participantes - 30 minutos" (la duración solo existe si hay fecha de fin). */
export function formatMeta(meeting: Meeting) {
  const count = `${meeting.participants} ${meeting.participants === 1 ? "participante" : "participantes"}`;
  const minutes = getDurationMinutes(meeting);
  return minutes === null ? count : `${count} - ${formatDuration(minutes)}`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toDateTimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ── Filtrado ─────────────────────────────────────────────────────────────────

export function meetingsForDay(meetings: Meeting[], tab: AgendaTab, day: Date) {
  return meetings
    .filter((m) => tabOf(m) === tab && isSameDay(new Date(m.startAt), day))
    .sort((a, b) => {
      const diff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
      return tab === "proximas" ? diff : -diff;
    });
}

/**
 * Día más cercano con reuniones en la pestaña: hacia adelante en "Próximas",
 * hacia atrás en "Finalizadas". null si no hay ninguno en esa dirección.
 */
export function findJumpDay(meetings: Meeting[], tab: AgendaTab, from: Date) {
  const base = startOfDay(from).getTime();
  const days = meetings
    .filter((m) => tabOf(m) === tab)
    .map((m) => startOfDay(new Date(m.startAt)).getTime())
    .filter((t) => (tab === "proximas" ? t > base : t < base));
  if (days.length === 0) return null;
  return new Date(tab === "proximas" ? Math.min(...days) : Math.max(...days));
}
