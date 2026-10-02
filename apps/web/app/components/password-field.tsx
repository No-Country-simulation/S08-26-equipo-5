"use client";

import { useState, type Ref } from "react";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
  /** ids extra para aria-describedby (ej. la lista de requisitos). */
  describedBy?: string;
};

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      {hidden && <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

/** Campo de contraseña con botón mostrar/ocultar, con el aspecto de los inputs del home. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  inputRef,
  placeholder,
  disabled,
  error,
  describedBy,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const described = [error ? errorId : null, describedBy].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-mf-navy">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={`block w-full rounded-[10px] border bg-white py-2.5 pl-3 pr-11 text-sm text-mf-navy placeholder:text-slate-400 focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed disabled:bg-mf-light ${
            error ? "border-red-500" : "border-mf-line"
          }`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-mf-muted hover:text-mf-navy focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed"
        >
          <EyeIcon hidden={visible} />
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
