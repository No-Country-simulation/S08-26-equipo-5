import type { SalaEstado } from "../../lib/salas-api";

const STATUS: Record<SalaEstado, { label: string; className: string }> = {
  PROGRAMADA: { label: "Programada", className: "bg-mf-blue-tint text-mf-blue" },
  ACTIVA: { label: "En curso", className: "bg-mf-green-tint text-mf-green" },
  // Coral del token oscurecido un paso para cumplir contraste AA en texto de 14px.
  FINALIZADA: { label: "Finalizada", className: "bg-mf-coral-tint text-[#b63d4a]" },
  CANCELADA: { label: "Cancelada", className: "bg-[#ecedf2] text-mf-muted" },
};

export function StatusBadge({ status }: { status: SalaEstado }) {
  const { label, className } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm ${className}`}
    >
      {status === "ACTIVA" && (
        <span aria-hidden="true" className="mf-skeleton size-2 rounded-full bg-mf-green" />
      )}
      {label}
    </span>
  );
}
