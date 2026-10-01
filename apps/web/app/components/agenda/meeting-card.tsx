import Link from "next/link";
import type { CSSProperties } from "react";
import {
  canJoin,
  formatMeta,
  formatTime,
  getJoinHref,
  isUpcoming,
  type Meeting,
} from "../../lib/agenda";
import { MeetingMenu, type MenuAction } from "./meeting-menu";
import { StatusBadge } from "./status-badge";
import { Button, buttonClass } from "../ui/button";
import { Card } from "../ui/card";

type MeetingCardProps = {
  meeting: Meeting;
  index: number;
  now: number;
  onSummary: (meeting: Meeting) => void;
  onCopy: (meeting: Meeting) => void;
  onEdit: (meeting: Meeting) => void;
  onCancel: (meeting: Meeting) => void;
};

function primaryLabel(meeting: Meeting) {
  if (meeting.role !== "HOST") return "Unirse";
  return meeting.status === "ACTIVA" ? "Entrar" : "Iniciar";
}

export function MeetingCard({
  meeting,
  index,
  now,
  onSummary,
  onCopy,
  onEdit,
  onCancel,
}: MeetingCardProps) {
  const upcoming = isUpcoming(meeting);
  const isHost = meeting.role === "HOST";

  const actions: MenuAction[] = [{ label: "Copiar enlace", onSelect: () => onCopy(meeting) }];
  // Editar: HOST en cualquier reunión no cancelada (la tabla anterior ya permitía editar finalizadas).
  if (isHost && meeting.status !== "CANCELADA") {
    actions.push({ label: "Editar", onSelect: () => onEdit(meeting) });
  }
  // Cancelar: solo HOST sobre reuniones programadas.
  if (isHost && meeting.status === "PROGRAMADA") {
    actions.push({ label: "Cancelar reunión", onSelect: () => onCancel(meeting), danger: true });
  }

  const actionClass = "flex-1 md:flex-none";

  return (
    <Card
      as="li"
      style={{ "--i": index } as CSSProperties}
      className="mf-enter relative grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-[transform,box-shadow] duration-200 has-[[aria-expanded=true]]:z-20 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(28,36,82,0.14)] md:min-h-[88px] md:grid-cols-[6rem_minmax(0,1fr)_auto_auto] md:gap-y-0 md:px-[18px] lg:grid-cols-[22rem_minmax(0,1fr)_auto_auto] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <p className="text-base font-bold tabular-nums text-mf-navy md:text-lg">
        {formatTime(meeting.startAt)}
      </p>

      <div className="order-3 col-span-2 min-w-0 md:order-none md:col-span-1">
        <h3 className="truncate text-base leading-6 text-mf-navy">{meeting.title}</h3>
        <p className="text-sm leading-5 text-mf-muted">{formatMeta(meeting)}</p>
      </div>

      <div className="justify-self-end">
        <StatusBadge status={meeting.status} />
      </div>

      <div className="order-4 col-span-2 flex items-center gap-3 md:order-none md:col-span-1">
        {upcoming ? (
          canJoin(meeting, now) ? (
            <Link href={getJoinHref(meeting)} className={buttonClass({ className: actionClass })}>
              {primaryLabel(meeting)}
            </Link>
          ) : (
            <Button
              disabled
              title="Podrás unirte 10 minutos antes del inicio"
              className={actionClass}
            >
              {primaryLabel(meeting)}
            </Button>
          )
        ) : (
          <Button
            onClick={() => onSummary(meeting)}
            className={actionClass}
            aria-label={`Ver resumen de ${meeting.title}`}
          >
            Ver resumen
          </Button>
        )}
        <MeetingMenu title={meeting.title} actions={actions} />
      </div>
    </Card>
  );
}
