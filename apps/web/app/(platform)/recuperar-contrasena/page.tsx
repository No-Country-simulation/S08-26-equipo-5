"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { AuthRequestError, requestPasswordReset } from "../../lib/auth";
import {
  EMAIL_PATTERN,
  RESEND_COOLDOWN_SECONDS,
  readRecoveryContext,
} from "../../lib/password-recovery";

const SENT_MESSAGE =
  "Si el email está registrado, te enviamos un enlace para restablecer la contraseña.";

function errorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 429) {
      return "Hiciste demasiados pedidos. Esperá unos minutos e intentá de nuevo.";
    }
    if (error.status === 400) return "Ingresá un correo válido.";
    return "No pudimos procesar el pedido. Intentá de nuevo en unos minutos.";
  }
  return "No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.";
}

export default function RecuperarContrasenaPage() {
  const baseId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [resentNotice, setResentNotice] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loginHref, setLoginHref] = useState("/login");

  // El email tipeado en el login y el destino de vuelta viajan por sessionStorage
  // (no por la URL), así que se leen después de montar.
  useEffect(() => {
    const context = readRecoveryContext();
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage solo existe en el cliente */
    if (context.email) setEmail(context.email);
    if (context.next) setLoginHref(`/login?next=${encodeURIComponent(context.next)}`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Al pasar de formulario a confirmación el foco va al título nuevo (no se pierde
  // al desmontarse el botón que se acaba de usar).
  function focusHeading() {
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function send(isResend: boolean) {
    if (sending) return;
    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Ingresá un correo válido.");
      emailRef.current?.focus();
      return;
    }

    setEmailError(null);
    setFormError(null);
    setResentNotice(false);
    setSending(true);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (isResend) setResentNotice(true);
      else focusHeading();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(false);
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

  const errorBox = formError && (
    <p
      role="alert"
      className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
    >
      {formError}
    </p>
  );

  const backToLogin = (
    <Link
      href={loginHref}
      className="font-bold text-mf-blue hover:underline focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue"
    >
      Volver a iniciar sesión
    </Link>
  );

  return (
    <section className="mx-auto w-full max-w-md sm:pt-6">
      <Card className="mf-enter p-6 sm:p-8">
        {sent ? (
          <>
            <p className="text-sm font-bold uppercase tracking-widest text-mf-blue">Correo enviado</p>
            <div className="mt-2">{heading("Revisá tu correo")}</div>
            <p className="mt-3 text-sm text-mf-muted">{SENT_MESSAGE}</p>
            <p className="mt-2 text-sm text-mf-muted">
              Revisá también la carpeta de spam. El enlace es de un solo uso y vence en unos
              minutos.
            </p>

            <p role="status" className="min-h-5 text-sm text-mf-green">
              {resentNotice ? "Te lo volvimos a enviar." : ""}
            </p>
            {errorBox}

            <Button
              variant="secondary"
              size="md"
              onClick={() => void send(true)}
              disabled={sending || cooldown > 0}
              aria-busy={sending || undefined}
              className="mt-4 w-full"
            >
              {sending
                ? "Enviando…"
                : cooldown > 0
                  ? `Reenviar correo en ${cooldown} s`
                  : "Reenviar correo"}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setSent(false);
                setResentNotice(false);
                setFormError(null);
                window.requestAnimationFrame(() => emailRef.current?.focus());
              }}
              className="mt-2 w-full"
            >
              Usar otro correo
            </Button>
            <p className="mt-4 text-center text-sm text-mf-muted">{backToLogin}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold uppercase tracking-widest text-mf-blue">Tu cuenta</p>
            <div className="mt-2">{heading("¿Olvidaste tu contraseña?")}</div>
            <p className="mt-3 text-sm text-mf-muted">
              Ingresá el correo de tu cuenta y te enviamos un enlace para crear una contraseña
              nueva.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6">
              <label htmlFor={`${baseId}-email`} className="block text-sm font-medium text-mf-navy">
                Correo electrónico
              </label>
              <input
                ref={emailRef}
                id={`${baseId}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nombre@correo.com"
                autoComplete="email"
                disabled={sending}
                autoFocus
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? `${baseId}-email-error` : undefined}
                className={`mt-1.5 block w-full rounded-[10px] border bg-white px-3 py-2.5 text-sm text-mf-navy placeholder:text-slate-400 focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed disabled:bg-mf-light ${
                  emailError ? "border-red-500" : "border-mf-line"
                }`}
              />
              {emailError && (
                <p id={`${baseId}-email-error`} role="alert" className="mt-1.5 text-sm text-red-600">
                  {emailError}
                </p>
              )}
              {errorBox}
              <Button
                type="submit"
                size="md"
                disabled={sending}
                aria-busy={sending || undefined}
                className="mt-6 w-full"
              >
                {sending ? "Enviando…" : "Enviar enlace"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-mf-muted">{backToLogin}</p>
          </>
        )}
      </Card>
    </section>
  );
}
