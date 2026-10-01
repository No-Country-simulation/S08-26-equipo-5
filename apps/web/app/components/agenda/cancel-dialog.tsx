"use client";

import { useState } from "react";
import type { Meeting } from "../../lib/agenda";
import { cancelSala } from "../../lib/salas-api";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";

export function CancelDialog({
  meeting,
  onClose,
  onCancelled,
}: {
  meeting: Meeting;
  onClose: () => void;
  onCancelled: () => void;
}) {
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
    <Modal title="¿Cancelar esta reunión?" onClose={onClose} dismissible={!busy}>
      <p className="mt-3 text-sm text-mf-muted">
        <strong className="font-bold text-mf-navy">{meeting.title}</strong> pasará a
        &quot;Cancelada&quot; y nadie podrá unirse. Esta acción no se puede deshacer.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {error}
        </p>
      )}
      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="md" onClick={onClose} disabled={busy}>
          Volver
        </Button>
        <Button variant="danger" size="md" onClick={confirm} disabled={busy}>
          {busy ? "Cancelando…" : "Cancelar reunión"}
        </Button>
      </div>
    </Modal>
  );
}
