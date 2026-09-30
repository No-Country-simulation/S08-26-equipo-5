"use client";

import { useId, useState, type FormEvent } from "react";
import { toDateTimeLocalValue, type Meeting } from "../../lib/agenda";
import { createSala, updateSala } from "../../lib/salas-api";
import { Dialog } from "./dialog";
import { btnPrimary, btnSecondary, fieldControl, fieldLabel } from "./ui";

type MeetingFormDialogProps =
  | { mode: "create"; initialDay: Date; onClose: () => void; onCreated: (startAt: Date) => void }
  | { mode: "edit"; meeting: Meeting; onClose: () => void; onSaved: () => void };

const TITLE_MAX = 150;

type FieldErrors = { title?: string; date?: string };

/** Próxima hora en punto (o las 10:00 del día elegido si es futuro) como valor por defecto. */
function defaultStart(day: Date) {
  const now = new Date();
  const start = new Date(day);
  if (start.getTime() > now.getTime()) {
    start.setHours(10, 0, 0, 0);
    return start;
  }
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next;
}

export function MeetingFormDialog(props: MeetingFormDialogProps) {
  const isEdit = props.mode === "edit";
  const titleId = useId();
  const [title, setTitle] = useState(isEdit ? props.meeting.title : "");
  const [description, setDescription] = useState(isEdit ? (props.meeting.description ?? "") : "");
  const [date, setDate] = useState(() =>
    props.mode === "create" ? toDateTimeLocalValue(defaultStart(props.initialDay)) : "",
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!title.trim()) next.title = "Ingresá un título para la reunión.";
    else if (title.trim().length > TITLE_MAX) next.title = `El título no puede superar los ${TITLE_MAX} caracteres.`;
    if (!isEdit) {
      if (!date) next.date = "Elegí una fecha y hora para la reunión.";
      else if (new Date(date).getTime() < Date.now()) {
        next.date = "La fecha y hora no pueden estar en el pasado.";
      }
    }
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setSubmitError("");
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      if (props.mode === "edit") {
        await updateSala(props.meeting.id, {
          nombre: title.trim(),
          resumen: description.trim() || null,
        });
        props.onSaved();
      } else {
        const startAt = new Date(date);
        await createSala({
          nombre: title.trim(),
          resumen: description.trim() || undefined,
          fechaInicio: startAt.toISOString(),
        });
        props.onCreated(startAt);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isEdit
            ? "No se pudo actualizar la reunión."
            : "No se pudo programar la reunión.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog titleId={titleId} onClose={props.onClose} dismissible={!saving}>
      <form onSubmit={handleSubmit} noValidate>
        <h2 id={titleId} className="text-2xl font-bold leading-8">
          {isEdit ? "Editar reunión" : "Programar reunión"}
        </h2>

        <div className="mt-6">
          <label className={fieldLabel}>
            Título
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Ej. Planificación del equipo"
              required
              autoFocus
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${titleId}-title-error` : undefined}
              className={fieldControl}
            />
          </label>
          {errors.title && (
            <p id={`${titleId}-title-error`} role="alert" className="mt-1.5 text-sm text-[#b63d4a]">
              {errors.title}
            </p>
          )}
        </div>

        <label className={`${fieldLabel} mt-5`}>
          Descripción <span className="font-normal text-mf-muted">(opcional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="¿De qué se va a tratar la reunión?"
            className={`${fieldControl} resize-y`}
          />
        </label>

        {!isEdit && (
          <div className="mt-5">
            <label className={fieldLabel}>
              Fecha y hora
              <input
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                min={toDateTimeLocalValue(new Date())}
                required
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={errors.date ? `${titleId}-date-error` : undefined}
                className={fieldControl}
              />
            </label>
            {errors.date && (
              <p id={`${titleId}-date-error`} role="alert" className="mt-1.5 text-sm text-[#b63d4a]">
                {errors.date}
              </p>
            )}
          </div>
        )}

        {submitError && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-mf-coral/40 bg-mf-coral-tint px-4 py-3 text-sm text-[#b63d4a]"
          >
            {submitError}
          </p>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={props.onClose}
            disabled={saving}
            className={`${btnSecondary} h-12`}
          >
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={`${btnPrimary} h-12`}>
            {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Programar reunión"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
