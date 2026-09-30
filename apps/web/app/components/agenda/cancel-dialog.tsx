"use client";

import { useId, useState } from "react";
import type { Meeting } from "../../lib/agenda";
import { cancelSala } from "../../lib/salas-api";
import { Dialog } from "./dialog";
import { btnDanger, btnSecondary } from "./ui";

export function CancelDialog({
  meeting,
  onClose,
  onCancelled,
}: {
  meeting: Meeting;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await cancelSala(meeting.id);
      onCancelled();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo cancelar la reunión.",
      );
      setBusy(false);
    }
  }

  return (
    <Dialog titleId={titleId} onClose={onClose} dismissible={!busy} className="max-w-md">
      <h2 id={titleId} className="text-2xl font-bold leading-8">
        ¿Cancelar esta reunión?
      </h2>
      <p className="mt-3 text-base text-mf-muted">
        <strong className="font-bold text-mf-navy">{meeting.title}</strong> pasará a
        &quot;Cancelada&quot; y nadie podrá unirse. Esta acción no se puede deshacer.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-mf-coral/40 bg-mf-coral-tint px-4 py-3 text-sm text-[#b63d4a]"
        >
          {error}
        </p>
      )}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={busy} className={`${btnSecondary} h-12`}>
          Volver
        </button>
        <button type="button" onClick={confirm} disabled={busy} className={`${btnDanger} h-12`}>
          {busy ? "Cancelando…" : "Cancelar reunión"}
        </button>
      </div>
    </Dialog>
  );
}
