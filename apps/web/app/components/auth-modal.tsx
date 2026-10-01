"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { AuthRequestError, useAuth } from "../lib/auth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

const LOGIN_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos. Intenta de nuevo.";
const PASSWORD_MISMATCH_MESSAGE = "Las contraseñas no coinciden";
const EMAIL_TAKEN_MESSAGE = "Ese correo ya está registrado";
const EMAIL_INVALID_MESSAGE = "Ingresa un correo válido.";
const PASSWORD_SHORT_MESSAGE = "La contraseña debe tener al menos 8 caracteres.";
const GENERIC_ERROR_MESSAGE = "No se pudo completar la solicitud. Intenta de nuevo.";
const REGISTER_THEN_LOGIN_MESSAGE = "Tu cuenta fue creada. Inicia sesión para continuar.";

type AuthMode = "login" | "register";

type FieldName = "nombre" | "apellido" | "email" | "password" | "confirm";

type FieldErrors = Partial<Record<FieldName, string>>;

export type AuthModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: AuthMode;
};

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      {hidden && <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.6" />}
    </svg>
  );
}

function mapAuthError(error: unknown, mode: AuthMode): { fields: FieldErrors; form: string | null } {
  if (error instanceof AuthRequestError) {
    if (error.status === 401) {
      return { fields: { password: LOGIN_CREDENTIALS_MESSAGE }, form: null };
    }
    if (error.status === 409 && mode === "register") {
      return { fields: { email: EMAIL_TAKEN_MESSAGE }, form: null };
    }
  }
  return { fields: {}, form: GENERIC_ERROR_MESSAGE };
}

export function AuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "login",
}: AuthModalProps) {
  const { login, register } = useAuth();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode(initialMode);
    } else {
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setFieldErrors({});
      setFormError(null);
      setLoading(false);
    }
  }

  function clearSensitiveState() {
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFieldErrors({});
    setFormError(null);
    setLoading(false);
  }

  function dismiss() {
    clearSensitiveState();
    onClose();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        setFieldErrors({});
        setFormError(null);
        setLoading(false);
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      firstFieldRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, mode]);

  if (!open) return null;

  function validate(): FieldErrors {
    const nextErrors: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (mode === "register") {
      if (nombre.trim().length === 0) nextErrors.nombre = "Ingresa tu nombre.";
      if (apellido.trim().length === 0) nextErrors.apellido = "Ingresa tu apellido.";
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      nextErrors.email = EMAIL_INVALID_MESSAGE;
    }

    if (mode === "register" && password.length < PASSWORD_MIN_LENGTH) {
      nextErrors.password = PASSWORD_SHORT_MESSAGE;
    } else if (mode === "login" && password.length === 0) {
      nextErrors.password = "Ingresa tu contraseña.";
    }

    if (mode === "register" && password !== confirmPassword) {
      nextErrors.confirm = PASSWORD_MISMATCH_MESSAGE;
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      if (mode === "register") {
        await register({
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim(),
          password,
        });
        try {
          await login(email.trim(), password);
        } catch {
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          setFieldErrors({});
          setFormError(REGISTER_THEN_LOGIN_MESSAGE);
          setLoading(false);
          return;
        }
      } else {
        await login(email.trim(), password);
      }

      clearSensitiveState();
      if (onSuccess) onSuccess();
      else onCloseRef.current();
    } catch (requestError) {
      const mapped = mapAuthError(requestError, mode);
      setFieldErrors(mapped.fields);
      setFormError(mapped.form);
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    if (loading) return;
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFieldErrors({});
    setFormError(null);
  }

  const passwordErrorId = `${titleId}-password-error`;
  const confirmErrorId = `${titleId}-confirm-error`;
  const emailErrorId = `${titleId}-email-error`;
  const nombreErrorId = `${titleId}-nombre-error`;
  const apellidoErrorId = `${titleId}-apellido-error`;
  const formErrorId = `${titleId}-form-error`;

  const inputClass = (invalid: boolean) =>
    `mt-1.5 block w-full rounded-[10px] border bg-white px-3 py-2.5 text-sm text-[#1c2452] placeholder:text-[#b0b4c3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb] disabled:cursor-not-allowed disabled:bg-[#f7f8fb] ${
      invalid ? "border-red-500" : "border-[#e4e6ee]"
    }`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#8b93c7]/55">
      <div
        className="flex min-h-full items-center justify-center p-3.5"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismiss();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="relative w-full max-w-[360px] rounded-[14px] bg-[#f3f4f8] px-5 py-5 shadow-[0_8px_30px_rgba(28,36,82,0.12)]"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-[22px] font-bold leading-tight text-[#1c2452]">
              {mode === "login" ? "Iniciar sesión" : "Crea tu cuenta"}
            </h2>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Cerrar"
              className="shrink-0 text-[28px] font-light leading-none text-[#1c2452] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb]"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-sm text-[#5c647a]">
            {mode === "login"
              ? "Accede para crear o programar una reunión"
              : "Regístrate para crear y gestionar tus reuniones"}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
            {mode === "register" && (
              <>
                <label className="block text-sm font-medium text-[#1c2452]" htmlFor={`${titleId}-nombre`}>
                  Nombre
                  <input
                    ref={firstFieldRef}
                    id={`${titleId}-nombre`}
                    value={nombre}
                    onChange={(event) => setNombre(event.target.value)}
                    placeholder="Ingresa tu nombre"
                    autoComplete="given-name"
                    disabled={loading}
                    aria-invalid={fieldErrors.nombre ? true : undefined}
                    aria-describedby={fieldErrors.nombre ? nombreErrorId : undefined}
                    className={inputClass(Boolean(fieldErrors.nombre))}
                  />
                </label>
                {fieldErrors.nombre && (
                  <p id={nombreErrorId} role="alert" className="text-sm text-red-600">
                    {fieldErrors.nombre}
                  </p>
                )}
                <label className="block text-sm font-medium text-[#1c2452]" htmlFor={`${titleId}-apellido`}>
                  Apellido
                  <input
                    id={`${titleId}-apellido`}
                    value={apellido}
                    onChange={(event) => setApellido(event.target.value)}
                    placeholder="Ingresa tu apellido"
                    autoComplete="family-name"
                    disabled={loading}
                    aria-invalid={fieldErrors.apellido ? true : undefined}
                    aria-describedby={fieldErrors.apellido ? apellidoErrorId : undefined}
                    className={inputClass(Boolean(fieldErrors.apellido))}
                  />
                </label>
                {fieldErrors.apellido && (
                  <p id={apellidoErrorId} role="alert" className="text-sm text-red-600">
                    {fieldErrors.apellido}
                  </p>
                )}
              </>
            )}

            <label className="block text-sm font-medium text-[#1c2452]" htmlFor={`${titleId}-email`}>
              Correo electrónico
              <input
                ref={mode === "login" ? firstFieldRef : undefined}
                id={`${titleId}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@correo.com"
                autoComplete="email"
                disabled={loading}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                className={inputClass(Boolean(fieldErrors.email))}
              />
            </label>
            {fieldErrors.email && (
              <p id={emailErrorId} role="alert" className="text-sm text-red-600">
                {fieldErrors.email}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1c2452]" htmlFor={`${titleId}-password`}>
                Contraseña
              </label>
              <div className="relative mt-1.5">
                <input
                  id={`${titleId}-password`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Ingresa tu contraseña"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={loading}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
                  className={`${inputClass(Boolean(fieldErrors.password))} mt-0 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  disabled={loading}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[#8b93a7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb] disabled:cursor-not-allowed"
                >
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
              {fieldErrors.password && (
                <p id={passwordErrorId} role="alert" className="mt-1.5 text-sm text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {mode === "login" && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="cursor-not-allowed text-[12px] font-medium text-[#3d4fdb]/70"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-[#1c2452]" htmlFor={`${titleId}-confirm`}>
                  Confirmar contraseña
                </label>
                <div className="relative mt-1.5">
                  <input
                    id={`${titleId}-confirm`}
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repite tu contraseña"
                    autoComplete="new-password"
                    disabled={loading}
                    aria-invalid={fieldErrors.confirm ? true : undefined}
                    aria-describedby={fieldErrors.confirm ? confirmErrorId : undefined}
                    className={`${inputClass(Boolean(fieldErrors.confirm))} mt-0 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    disabled={loading}
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-[#8b93a7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb] disabled:cursor-not-allowed"
                  >
                    <EyeIcon hidden={showConfirmPassword} />
                  </button>
                </div>
                {fieldErrors.confirm && (
                  <p id={confirmErrorId} role="alert" className="mt-1.5 text-sm text-red-600">
                    {fieldErrors.confirm}
                  </p>
                )}
              </div>
            )}

            {formError && (
              <p id={formErrorId} role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading || undefined}
              className="w-full rounded-[10px] bg-[#3d4fdb] px-4 py-3 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2452] disabled:cursor-not-allowed disabled:opacity-80"
            >
              {loading
                ? mode === "login"
                  ? "Iniciando sesión…"
                  : "Creando cuenta…"
                : mode === "login"
                  ? "Iniciar sesión"
                  : "Crear cuenta"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-[#5c647a]">
            {mode === "login" ? "¿No tienes una cuenta? " : "¿Ya tienes una cuenta? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "login" ? "register" : "login")}
              disabled={loading}
              className="font-bold text-[#3d4fdb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb] disabled:cursor-not-allowed"
            >
              {mode === "login" ? "Regístrate" : "Inicia sesión"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
