"use client";

import { FormEvent, useEffect, useState } from "react";

export type ScheduleMeetingInput = {
  nombre: string;
  resumen?: string;
  fechaInicio: string;
};

type ScheduleMeetingModalProps = {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: ScheduleMeetingInput) => void;
};

export function ScheduleMeetingModal({
  open,
  submitting,
  error,
  onClose,
  onSubmit,
}: ScheduleMeetingModalProps) {
  const [nombre, setNombre] = useState("");
  const [resumen, setResumen] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");

    if (!nombre.trim()) {
      setLocalError("Ingresá un título para la reunión.");
      return;
    }
    if (!scheduledAt) {
      setLocalError("Elegí una fecha y hora para programar la reunión.");
      return;
    }

    onSubmit({
      nombre: nombre.trim(),
      resumen: resumen.trim() || undefined,
      fechaInicio: new Date(scheduledAt).toISOString(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar programación de reunión"
          className="absolute right-4 top-4 rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-950"
        >
          ×
        </button>

        <p className="text-sm font-semibold uppercase tracking-widest text-[#3d4fdb]">
          Programar reunión
        </p>
        <h2 id="schedule-modal-title" className="mt-3 text-2xl font-bold tracking-tight text-[#1c2452]">
          Escoge una fecha y configurá la sesión
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block text-sm font-medium text-slate-700">
            Título
            <input
              type="text"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej. Planificación del equipo"
              maxLength={150}
              autoFocus
              required
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950 placeholder:text-slate-400"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Descripción <span className="font-normal text-slate-500">(opcional)</span>
            <textarea
              value={resumen}
              onChange={(event) => setResumen(event.target.value)}
              placeholder="¿De qué se va a tratar la reunión?"
              rows={3}
              className="mt-2 block w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950 placeholder:text-slate-400"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Fecha y hora
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              required
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
            />
          </label>

          {(localError || error) && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {localError || error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting || undefined}
            className="w-full rounded-full bg-[#3d4fdb] px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Programando…" : "Programar reunión"}
          </button>
        </form>
      </div>
    </div>
  );
}
