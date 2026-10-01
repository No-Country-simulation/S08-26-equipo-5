"use client";

import { FormEvent, useEffect, useId, useRef, useState, type RefObject } from "react";

const TITLE_MAX_LENGTH = 150;

export type ScheduleMeetingInput = {
  nombre: string;
  resumen?: string;
  fechaInicio: string;
};

export type ImmediateMeetingInput = {
  nombre: string;
  resumen?: string;
};

type MeetingMode = "now" | "schedule";

type FieldErrors = {
  nombre?: string;
  scheduledAt?: string;
};

type ScheduleMeetingModalProps = {
  mode: MeetingMode;
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: ScheduleMeetingInput | ImmediateMeetingInput) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

function trimmedOrUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function ScheduleMeetingModal({
  mode,
  open,
  submitting,
  error,
  onClose,
  onSubmit,
  returnFocusRef,
}: ScheduleMeetingModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  const [nombre, setNombre] = useState("");
  const [resumen, setResumen] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setNombre("");
      setResumen("");
      setScheduledAt("");
      setFieldErrors({});
    }
  }

  function clearFields() {
    setNombre("");
    setResumen("");
    setScheduledAt("");
    setFieldErrors({});
  }

  function dismiss() {
    clearFields();
    onClose();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const returnFocus = returnFocusRef?.current ?? null;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setNombre("");
        setResumen("");
        setScheduledAt("");
        setFieldErrors({});
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, mode]);

  if (!open) return null;

  const trimmedTitle = nombre.trim();
  const nombreErrorId = `${titleId}-nombre-error`;
  const nombreCountId = `${titleId}-nombre-count`;
  const dateErrorId = `${titleId}-date-error`;
  const formErrorId = `${titleId}-form-error`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const nextErrors: FieldErrors = {};
    if (trimmedTitle.length === 0) {
      nextErrors.nombre = "Ingresá un título para la reunión.";
    } else if (trimmedTitle.length > TITLE_MAX_LENGTH) {
      nextErrors.nombre = "El título no puede superar los 150 caracteres.";
    }
    if (mode === "schedule" && !scheduledAt) {
      nextErrors.scheduledAt = "Elegí una fecha y hora para programar la reunión.";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const description = trimmedOrUndefined(resumen);
    if (mode === "now") {
      onSubmit({ nombre: trimmedTitle, resumen: description });
      return;
    }

    onSubmit({
      nombre: trimmedTitle,
      resumen: description,
      fechaInicio: new Date(scheduledAt).toISOString(),
    });
  }

  const inputClass = (invalid: boolean) =>
    `mt-2 block w-full rounded-lg border px-3 py-2.5 font-normal text-slate-950 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb] disabled:cursor-not-allowed disabled:bg-slate-50 ${
      invalid ? "border-red-500" : "border-slate-300"
    }`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 backdrop-blur-sm">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label={mode === "now" ? "Cerrar" : "Cerrar programación de reunión"}
            className="absolute right-4 top-4 rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb]"
          >
            ×
          </button>

          <p className="text-sm font-semibold uppercase tracking-widest text-[#3d4fdb]">
            {mode === "now" ? "Reunión inmediata" : "Programar reunión"}
          </p>
          <h2 id={titleId} className="mt-3 text-2xl font-bold tracking-tight text-[#1c2452]">
            {mode === "now" ? "Ingresá un título para empezar ahora" : "Escoge una fecha y configurá la sesión"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-nombre`}>
                Título
              </label>
              <input
                ref={firstFieldRef}
                id={`${titleId}-nombre`}
                type="text"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Ej. Planificación del equipo"
                autoComplete="off"
                disabled={submitting}
                aria-invalid={fieldErrors.nombre ? true : undefined}
                aria-describedby={`${nombreCountId}${fieldErrors.nombre ? ` ${nombreErrorId}` : ""}`}
                className={inputClass(Boolean(fieldErrors.nombre))}
              />
              <p id={nombreCountId} className="mt-1 text-right text-xs text-slate-500">
                {trimmedTitle.length}/{TITLE_MAX_LENGTH}
              </p>
              {fieldErrors.nombre && (
                <p id={nombreErrorId} role="alert" className="mt-1 text-sm text-red-600">
                  {fieldErrors.nombre}
                </p>
              )}
            </div>

            <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-resumen`}>
              Descripción <span className="font-normal text-slate-500">(opcional)</span>
              <textarea
                id={`${titleId}-resumen`}
                value={resumen}
                onChange={(event) => setResumen(event.target.value)}
                placeholder="¿De qué se va a tratar la reunión?"
                rows={3}
                disabled={submitting}
                className={`${inputClass(false)} resize-y`}
              />
            </label>

            {mode === "schedule" && (
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor={`${titleId}-fecha`}>
                  Fecha y hora
                </label>
                <input
                  id={`${titleId}-fecha`}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  disabled={submitting}
                  aria-invalid={fieldErrors.scheduledAt ? true : undefined}
                  aria-describedby={fieldErrors.scheduledAt ? dateErrorId : undefined}
                  className={inputClass(Boolean(fieldErrors.scheduledAt))}
                />
                {fieldErrors.scheduledAt && (
                  <p id={dateErrorId} role="alert" className="mt-1 text-sm text-red-600">
                    {fieldErrors.scheduledAt}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p id={formErrorId} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              aria-busy={submitting || undefined}
              className="w-full rounded-full bg-[#3d4fdb] px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2452] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mode === "now"
                ? submitting
                  ? "Creando reunión…"
                  : "Crear reunión"
                : submitting
                  ? "Programando…"
                  : "Programar reunión"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
