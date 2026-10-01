import type { SalaEstado } from "../../lib/salas-api";
import { Badge, type BadgeTone } from "../ui/badge";

const STATUS: Record<SalaEstado, { label: string; tone: BadgeTone }> = {
  PROGRAMADA: { label: "Programada", tone: "info" },
  ACTIVA: { label: "En curso", tone: "success" },
  FINALIZADA: { label: "Finalizada", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
};

export function StatusBadge({ status }: { status: SalaEstado }) {
  const { label, tone } = STATUS[status];
  return (
    <Badge tone={tone}>
      {status === "ACTIVA" && (
        <span aria-hidden="true" className="mf-skeleton size-2 rounded-full bg-mf-green" />
      )}
      {label}
    </Badge>
  );
}
