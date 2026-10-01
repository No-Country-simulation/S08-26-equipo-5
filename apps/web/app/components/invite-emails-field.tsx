"use client";

import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { mergeEmails, type MergeEmailsResult } from "../lib/invite-emails";
import { MAX_INVITACIONES_POR_SOLICITUD } from "../lib/salas-api";

export type InviteEmailsFieldHandle = {
  /**
   * Confirma lo que haya escrito sin confirmar y devuelve la lista final, o null
   * si quedó algo inválido (muestra el error y devuelve el foco al campo).
   */
  flush: () => string[] | null;
  focus: () => void;
};

type InviteEmailsFieldProps = {
  emails: string[];
  onChange: (emails: string[]) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  max?: number;
  /** Error externo (p. ej. de la API) asociado al campo. */
  error?: string | null;
};

/**
 * Campo de correos en chips: Enter, coma, punto y coma, pegar o salir del campo
 * confirman lo escrito; Backspace con el campo vacío quita el último.
 */
export const InviteEmailsField = forwardRef<InviteEmailsFieldHandle, InviteEmailsFieldProps>(
  function InviteEmailsField(
    {
      emails,
      onChange,
      label = "Invitar por correo",
      hint = "Separá los correos con coma, espacio o Enter.",
      disabled = false,
      max = MAX_INVITACIONES_POR_SOLICITUD,
      error,
    },
    ref,
  ) {
    const baseId = useId();
    const inputId = `${baseId}-input`;
    const hintId = `${baseId}-hint`;
    const countId = `${baseId}-count`;
    const errorId = `${baseId}-error`;
    const inputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    function describe(invalid: string[], overflow: string[]) {
      if (invalid.length > 0) {
        return invalid.length === 1
          ? `"${invalid[0]}" no es un correo válido.`
          : `Estos correos no son válidos: ${invalid.join(", ")}.`;
      }
      if (overflow.length > 0) return `Podés invitar hasta ${max} personas por vez.`;
      return null;
    }

    /** Aplica `raw` a la lista; deja en el campo lo que no pudo confirmar. */
    function commit(raw: string): MergeEmailsResult {
      if (raw.trim().length === 0) {
        setDraft("");
        return { emails, invalid: [], overflow: [] };
      }
      const result = mergeEmails(raw, emails, max);
      if (result.emails.length !== emails.length) onChange(result.emails);
      setDraft([...result.invalid, ...result.overflow].join(" "));
      setLocalError(describe(result.invalid, result.overflow));
      return result;
    }

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      flush: () => {
        const outcome = commit(draft);
        if (outcome.invalid.length > 0 || outcome.overflow.length > 0) {
          inputRef.current?.focus();
          return null;
        }
        return outcome.emails;
      },
    }));

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
      // Con IME (composición en curso) Enter confirma el carácter, no el chip.
      if (event.nativeEvent.isComposing) return;
      // Con el borrador vacío, Enter se comporta como en cualquier otro campo y
      // envía el formulario (por ejemplo "Enviar invitaciones").
      if (event.key === "Enter" && draft.trim() === "") return;
      if (event.key === "Enter" || event.key === "," || event.key === ";") {
        // Con texto escrito, Enter lo convierte en chip y no envía: evita crear
        // la reunión por error a mitad de un correo. La coma tampoco se escribe.
        event.preventDefault();
        commit(draft);
      } else if (event.key === "Backspace" && draft.length === 0 && emails.length > 0) {
        onChange(emails.slice(0, -1));
        setLocalError(null);
      }
    }

    function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
      const pasted = event.clipboardData.getData("text");
      if (!/[\s,;]/.test(pasted.trim())) return; // un solo correo: pegado normal
      event.preventDefault();
      commit(`${draft} ${pasted}`);
    }

    function remove(email: string) {
      onChange(emails.filter((item) => item !== email));
      setLocalError(null);
      inputRef.current?.focus();
    }

    const shownError = localError ?? error ?? null;
    const full = emails.length >= max;

    return (
      <div>
        <label htmlFor={inputId} className="block text-sm font-medium text-mf-navy">
          {label}
        </label>
        <div
          onClick={() => inputRef.current?.focus()}
          className={`mt-1.5 flex flex-wrap items-center gap-1.5 rounded-[10px] border px-2 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mf-blue ${
            shownError ? "border-red-500" : "border-mf-line"
          } ${disabled ? "bg-mf-light" : "bg-white"}`}
        >
          {emails.length > 0 && (
            <ul aria-label="Correos a invitar" className="contents">
              {emails.map((email) => (
                <li
                  key={email}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-mf-blue-tint py-0.5 pl-3 pr-1 text-sm text-mf-navy"
                >
                  <span className="truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => remove(email)}
                    disabled={disabled}
                    aria-label={`Quitar ${email}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-base leading-none text-mf-muted hover:bg-white hover:text-mf-navy focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={draft}
            disabled={disabled}
            placeholder={emails.length === 0 ? "nombre@correo.com" : full ? "" : "Agregar otro…"}
            onChange={(event) => {
              setDraft(event.target.value);
              if (localError) setLocalError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={() => commit(draft)}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={`${hintId} ${countId}${shownError ? ` ${errorId}` : ""}`}
            className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-mf-navy placeholder:text-slate-400 focus-visible:shadow-none focus-visible:outline-none disabled:cursor-not-allowed"
          />
        </div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <p id={hintId} className="text-xs text-mf-muted">
            {hint}
          </p>
          <p id={countId} className="shrink-0 text-xs tabular-nums text-mf-muted">
            {emails.length}/{max}
          </p>
        </div>
        {shownError && (
          <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
            {shownError}
          </p>
        )}
      </div>
    );
  },
);
