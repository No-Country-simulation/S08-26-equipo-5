"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PasswordField } from "../../../components/password-field";
import { Button, buttonClass } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import {
  AuthRequestError,
  RESET_TOKEN_INVALID,
  resetPassword,
  validateResetToken,
} from "../../../lib/auth";
import {
  PASSWORD_MIN_LENGTH,
  clearRecoveryContext,
  readRecoveryContext,
} from "../../../lib/password-recovery";

type Load =
  | { status: "loading" }
  | { status: "valid"; emailEnmascarado: string }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | { status: "done" };

type FieldErrors = { password?: string; confirm?: string };

function connectionMessage(error: unknown): string {
  if (error instanceof AuthRequestError && error.status === 429) {
    return "Hubo demasiados intentos. Esperá unos minutos e intentá de nuevo.";
  }
  return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md sm:pt-6">
      <Card className="mf-enter p-6 sm:p-8">{children}</Card>
    </section>
  );
}

function Requirement({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-start gap-2 ${met ? "text-mf-green" : "text-mf-muted"}`}>
      <span aria-hidden="true" className="w-4 shrink-0 text-center font-bold">
        {met ? "✓" : "○"}
      </span>
      <span>
        {children}
        <span className="sr-only">{met ? " (cumplido)" : " (pendiente)"}</span>
      </span>
    </li>
  );
}

export default function RestablecerContrasenaPage() {
  const { token } = useParams<{ token: string }>();
  const baseId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loginHref, setLoginHref] = useState("/login?reset=1");

  // Destino de vuelta guardado al pedir el enlace (ej. una invitación pendiente).
  useEffect(() => {
    const { next } = readRecoveryContext();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el cliente
    if (next) setLoginHref(`/login?reset=1&next=${encodeURIComponent(next)}`);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    validateResetToken(token, controller.signal)
      .then((result) => setLoad({ status: "valid", emailEnmascarado: result.emailEnmascarado }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AuthRequestError && error.code === RESET_TOKEN_INVALID) {
          setLoad({ status: "invalid" });
        } else {
          setLoad({ status: "error", message: connectionMessage(error) });
        }
      });
    return () => controller.abort();
  }, [token, attempt]);

  // Al resolverse la carga o cambiar de situación, el foco va al título nuevo.
  const view = load.status;
  useEffect(() => {
    if (view !== "loading") headingRef.current?.focus();
  }, [view]);

  const longEnough = password.length >= PASSWORD_MIN_LENGTH;
  const matches = confirm.length > 0 && password === confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const errors: FieldErrors = {};
    if (!longEnough) {
      errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    }
    if (password !== confirm) errors.confirm = "Las contraseñas no coinciden.";
    setFieldErrors(errors);
    setFormError(null);
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    if (errors.confirm) {
      confirmRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setPassword("");
      setConfirm("");
      setLoad({ status: "done" });
    } catch (error) {
      if (error instanceof AuthRequestError && error.code === RESET_TOKEN_INVALID) {
        setPassword("");
        setConfirm("");
        setLoad({ status: "invalid" });
      } else if (error instanceof AuthRequestError && error.status === 400) {
        setFormError("La contraseña no cumple los requisitos. Revisala e intentá de nuevo.");
      } else {
        setFormError(connectionMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const heading = (text: string) => (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="break-words text-2xl font-bold leading-tight text-mf-navy focus-visible:outline-none"
    >
      {text}
    </h1>
  );

  if (load.status === "loading") {
    return (
      <Shell>
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Verificando el enlace…</span>
          <span className="mf-skeleton block h-7 w-3/4 rounded bg-mf-line" />
          <span className="mf-skeleton block h-4 w-1/2 rounded bg-mf-line/70" />
          <span className="mf-skeleton mt-6 block h-11 w-full rounded-full bg-mf-line" />
        </div>
      </Shell>
    );
  }

  if (load.status === "invalid") {
    return (
      <Shell>
        {heading("Este enlace ya no es válido")}
        <p className="mt-3 text-sm text-mf-muted">
          El enlace venció o ya se usó. Podés pedir uno nuevo en un momento.
        </p>
        <Link
          href="/recuperar-contrasena"
          className={buttonClass({ size: "md", className: "mt-6 w-full" })}
        >
          Pedir un enlace nuevo
        </Link>
        <Link
          href="/login"
          className={buttonClass({ variant: "ghost", size: "md", className: "mt-2 w-full" })}
        >
          Volver a iniciar sesión
        </Link>
      </Shell>
    );
  }

  if (load.status === "error") {
    return (
      <Shell>
        {heading("No pudimos verificar el enlace")}
        <p role="alert" className="mt-3 text-sm text-mf-muted">
          {load.message}
        </p>
        <Button
          size="md"
          onClick={() => {
            setLoad({ status: "loading" });
            setAttempt((current) => current + 1);
          }}
          className="mt-6 w-full"
        >
          Reintentar
        </Button>
      </Shell>
    );
  }

  if (load.status === "done") {
    return (
      <Shell>
        <p className="text-sm font-bold uppercase tracking-widest text-mf-green">Listo</p>
        <div className="mt-2">{heading("Contraseña actualizada")}</div>
        <p className="mt-3 text-sm text-mf-muted">
          Ya podés iniciar sesión con tu contraseña nueva. Por seguridad, cerramos las sesiones
          abiertas en tus otros dispositivos.
        </p>
        {/* replace: "atrás" no debe volver a esta página, cuyo enlace ya se consumió. */}
        <Link
          href={loginHref}
          replace
          onClick={clearRecoveryContext}
          className={buttonClass({ size: "md", className: "mt-6 w-full" })}
        >
          Iniciar sesión
        </Link>
      </Shell>
    );
  }

  const requirementsId = `${baseId}-requirements`;

  return (
    <Shell>
      <p className="text-sm font-bold uppercase tracking-widest text-mf-blue">Tu cuenta</p>
      <div className="mt-2">{heading("Creá una contraseña nueva")}</div>
      <p className="mt-3 text-sm text-mf-muted">
        Vas a cambiar la contraseña de{" "}
        <strong className="break-all text-mf-navy">{load.emailEnmascarado}</strong>.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <PasswordField
          id={`${baseId}-password`}
          label="Contraseña nueva"
          value={password}
          onChange={setPassword}
          inputRef={passwordRef}
          autoComplete="new-password"
          disabled={submitting}
          error={fieldErrors.password}
          describedBy={requirementsId}
        />
        <ul id={requirementsId} className="space-y-1 text-sm">
          <Requirement met={longEnough}>Al menos {PASSWORD_MIN_LENGTH} caracteres</Requirement>
          <Requirement met={matches}>Las dos contraseñas coinciden</Requirement>
        </ul>
        <PasswordField
          id={`${baseId}-confirm`}
          label="Repetí la contraseña"
          value={confirm}
          onChange={setConfirm}
          inputRef={confirmRef}
          autoComplete="new-password"
          disabled={submitting}
          error={fieldErrors.confirm}
        />
        {formError && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
          >
            {formError}
          </p>
        )}
        <Button
          type="submit"
          size="md"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="w-full"
        >
          {submitting ? "Guardando…" : "Guardar contraseña"}
        </Button>
      </form>
    </Shell>
  );
}
