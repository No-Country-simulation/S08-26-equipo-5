"use client";

import { FormEvent, useEffect, useId, useRef, useState, type RefObject } from "react";
import { InviteEmailsField, type InviteEmailsFieldHandle } from "./invite-emails-field";

const TITLE_MAX_LENGTH = 150;

export type ScheduleMeetingInput = {
  nombre: string;
  resumen?: string;
  fechaInicio: string;
  /** Correos a invitar tras crear la reunión (solo con `allowInvites`). */
  emails?: string[];
};

export type ImmediateMeetingInput = {
  nombre: string;
  resumen?: string;
  /** Correos a invitar tras crear la reunión (solo con `allowInvites`). */
  emails?: string[];
};

// "edit" reutiliza el formulario para cambiar título y descripción (sin fecha);
// se monta solo mientras se edita, con `initialValues` de la reunión.
type MeetingMode = "now" | "schedule" | "edit";

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
  initialValues?: { nombre: string; resumen?: string | null };
  /** Muestra el campo opcional "Invitar por correo" (modos now y schedule). */
  allowInvites?: boolean;
};

/** Inicio del minuto actual: mismo truncado que el `min` del input, para no rechazar ese valor. */
function startOfCurrentMinute() {
  const now = new Date();
  now.setSeconds(0, 0);
  return now.getTime();
}

/** Valor para <input type="datetime-local"> en hora local (no UTC). */
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
  initialValues,
  allowInvites = false,
}: ScheduleMeetingModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  const [nombre, setNombre] = useState(initialValues?.nombre ?? "");
  const [resumen, setResumen] = useState(initialValues?.resumen ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const inviteRef = useRef<InviteEmailsFieldHandle>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setNombre("");
      setResumen("");
      setScheduledAt("");
      setEmails([]);
      setFieldErrors({});
    }
  }

  function clearFields() {
    setNombre("");
    setResumen("");
    setScheduledAt("");
    setEmails([]);
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
        setEmails([]);
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

  const invitesEnabled = allowInvites && mode !== "edit";
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
    } else if (mode === "schedule" && new Date(scheduledAt).getTime() < startOfCurrentMinute()) {
      nextErrors.scheduledAt = "La fecha y hora no pueden estar en el pasado.";
    }

    setFieldErrors(nextErrors);
    // flush() confirma lo escrito en el campo de correos; null = quedó algo inválido.
    const inviteList = invitesEnabled && inviteRef.current ? inviteRef.current.flush() : [];
    if (Object.keys(nextErrors).length > 0 || inviteList === null) return;

    const description = trimmedOrUndefined(resumen);
    const invitees = inviteList.length > 0 ? { emails: inviteList } : {};
    if (mode === "now" || mode === "edit") {
      onSubmit({ nombre: trimmedTitle, resumen: description, ...invitees });
      return;
    }

    onSubmit({
      nombre: trimmedTitle,
      resumen: description,
      fechaInicio: new Date(scheduledAt).toISOString(),
      ...invitees,
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
            aria-label={mode === "schedule" ? "Cerrar programación de reunión" : "Cerrar"}
            className="absolute right-4 top-4 rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb]"
          >
            ×
          </button>

          <p className="text-sm font-semibold uppercase tracking-widest text-[#3d4fdb]">
            {mode === "now" ? "Reunión inmediata" : mode === "edit" ? "Editar reunión" : "Programar reunión"}
          </p>
          <h2 id={titleId} className="mt-3 text-2xl font-bold tracking-tight text-[#1c2452]">
            {mode === "now"
              ? "Ingresá un título para empezar ahora"
              : mode === "edit"
                ? "Actualizá el título y la descripción"
                : "Escoge una fecha y configurá la sesión"}
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
                  min={toLocalInputValue(new Date())}
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

            {invitesEnabled && (
              <InviteEmailsField
                ref={inviteRef}
                label="Invitar por correo (opcional)"
                emails={emails}
                onChange={setEmails}
                disabled={submitting}
              />
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
              {mode === "edit"
                ? submitting
                  ? "Guardando…"
                  : "Guardar cambios"
                : mode === "now"
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
