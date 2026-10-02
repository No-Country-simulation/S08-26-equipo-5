"use client";

import type { InvitacionResultado } from "../lib/salas-api";
import { Badge, type BadgeTone } from "./ui/badge";
import { Button } from "./ui/button";

type Row = { email: string; label: string; tone: BadgeTone; retry: boolean };

function toRow(item: InvitacionResultado): Row {
  if (item.estado === "YA_PARTICIPA") {
    return { email: item.email, label: "Ya participa", tone: "neutral", retry: false };
  }
  if (!item.emailEnviado) {
    return { email: item.email, label: "Error de envío", tone: "danger", retry: true };
  }
  return item.estado === "REENVIADO"
    ? { email: item.email, label: "Reenviado", tone: "info", retry: false }
    : { email: item.email, label: "Invitado", tone: "success", retry: false };
}

type InviteResultsProps = {
  resultados: InvitacionResultado[];
  /** Emails reintentables, incluidos los que nunca llegaron a tener resultado. */
  retryable: string[];
  onRetry: (emails: string[]) => void;
  sending?: boolean;
  /** Error de la última llamada (red, límite de envíos, etc.). */
  error?: string | null;
};

/**
 * Resultado de invitar por correo, un renglón por email. Es una región `status`
 * (aria-live polite) para que el lector de pantalla anuncie el resultado.
 */
export function InviteResults({ resultados, retryable, onRetry, sending, error }: InviteResultsProps) {
  const known = new Set(resultados.map((item) => item.email));
  const rows: Row[] = [
    ...resultados.map(toRow),
    ...retryable
      .filter((email) => !known.has(email))
      .map((email): Row => ({ email, label: "Error de envío", tone: "danger", retry: true })),
  ];

  return (
    <div role="status" aria-live="polite">
      {rows.length > 0 && (
        <ul aria-label="Resultado de las invitaciones" className="mt-4 space-y-2">
          {rows.map((row) => (
            <li
              key={row.email}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-[10px] border border-mf-line bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-mf-navy">{row.email}</span>
              <span className="flex items-center gap-2">
                <Badge tone={row.tone}>{row.label}</Badge>
                {row.retry && (
                  <Button
                    variant="ghost"
                    onClick={() => onRetry([row.email])}
                    disabled={sending}
                    aria-label={`Reintentar envío a ${row.email}`}
                    className="!px-1 !py-1"
                  >
                    Reintentar
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
      {retryable.length > 1 && (
        <Button
          variant="secondary"
          onClick={() => onRetry(retryable)}
          disabled={sending}
          className="mt-3"
        >
          {sending ? "Reenviando…" : `Reintentar los ${retryable.length} fallidos`}
        </Button>
      )}
    </div>
  );
}
