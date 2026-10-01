"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AuthModal } from "../../../components/auth-modal";
import { Button, buttonClass } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { useAuth } from "../../../lib/auth";
import { saveGuestSession } from "../../../lib/guest-session";
import {
  aceptarInvitacion,
  ApiRequestError,
  getInvitacion,
  type InvitacionPreview,
} from "../../../lib/salas-api";

type Load =
  | { status: "loading" }
  | { status: "ready"; preview: InvitacionPreview }
  | { status: "invalid" }
  | { status: "error"; message: string };

/** Situaciones sin salida directa: reemplazan al formulario hasta que el usuario actúe. */
type Blocked = { kind: "mismatch" } | { kind: "already" } | null;

type FieldErrors = { nombre?: string; apellido?: string };

const inputClass = (invalid: boolean) =>
  `mt-1.5 block w-full rounded-[10px] border bg-white px-3 py-2.5 text-sm text-mf-navy placeholder:text-slate-400 focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed disabled:bg-mf-light ${
    invalid ? "border-red-500" : "border-mf-line"
  }`;

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md sm:pt-6">
      <Card className="mf-enter p-6 sm:p-8">{children}</Card>
    </section>
  );
}

export default function InvitacionPage() {
  const router = useRouter();
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, isReady, user, logout } = useAuth();

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const headingRef = useRef<HTMLHeadingElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const apellidoRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const fetchPreview = useCallback(async () => {
    try {
      const preview = await getInvitacion(token);
      setLoad({ status: "ready", preview });
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "INVITATION_INVALID") {
        setLoad({ status: "invalid" });
      } else {
        setLoad({
          status: "error",
          message:
            error instanceof ApiRequestError && error.code === "RATE_LIMITED"
              ? "Hubo demasiados intentos. Esperá unos minutos e intentá de nuevo."
              : "No pudimos cargar la invitación. Revisá tu conexión e intentá de nuevo.",
        });
      }
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void fetchPreview();
  }, [fetchPreview]);

  // Al resolverse la carga o cambiar de situación, el foco va al título nuevo.
  const view = load.status === "ready" ? (blocked?.kind ?? "ready") : load.status;
  useEffect(() => {
    if (view !== "loading") headingRef.current?.focus();
  }, [view]);

  async function accept(body?: { nombre: string; apellido: string }) {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await aceptarInvitacion(token, body);
      // Misma sesión que usa la sala de espera para `join:subscribe` y mi-estado,
      // también para usuarios con cuenta (igual que el ingreso por código).
      saveGuestSession({
        accessToken: result.accessToken,
        participanteId: result.participanteId,
        salaId: result.salaId,
      });
      // replace: el token ya quedó consumido; "atrás" no debe volver a esta
      // página (mostraría "ya no es válida") y además sale del historial.
      router.replace(`/waiting-room?code=${encodeURIComponent(result.salaCodigo)}`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiRequestError) {
        switch (error.code) {
          case "INVITATION_INVALID":
            setLoad({ status: "invalid" });
            return;
          case "INVITATION_ACCOUNT_MISMATCH":
            setBlocked({ kind: "mismatch" });
            return;
          case "ALREADY_PARTICIPANT":
            setBlocked({ kind: "already" });
            return;
          case "LOGIN_REQUIRED":
            setFormError("Iniciá sesión con la cuenta invitada para aceptar.");
            setAuthOpen(true);
            return;
          case "RATE_LIMITED":
            setFormError("Hubo demasiados intentos. Esperá unos minutos e intentá de nuevo.");
            return;
        }
        setFormError(error.message);
        return;
      }
      setFormError("No pudimos aceptar la invitación. Intentá de nuevo.");
    }
  }

  function handleGuestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (nombre.trim().length === 0) errors.nombre = "Ingresá tu nombre.";
    if (apellido.trim().length === 0) errors.apellido = "Ingresá tu apellido.";
    setFieldErrors(errors);
    if (errors.nombre) {
      nombreRef.current?.focus();
      return;
    }
    if (errors.apellido) {
      apellidoRef.current?.focus();
      return;
    }
    void accept({ nombre: nombre.trim(), apellido: apellido.trim() });
  }

  async function handleSwitchAccount() {
    await logout();
    setBlocked(null);
    setFormError(null);
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

  const homeLink = (
    <Link href="/home" className={buttonClass({ size: "md", className: "mt-6 w-full" })}>
      Ir al inicio
    </Link>
  );

  if (view === "loading" || !isReady) {
    return (
      <Shell>
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Cargando invitación…</span>
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
        {heading("Esta invitación ya no es válida")}
        <p className="mt-3 text-sm text-mf-muted">
          El enlace venció, ya se usó o la reunión terminó. Pedile al anfitrión que te vuelva a
          invitar.
        </p>
        {homeLink}
      </Shell>
    );
  }

  if (load.status === "error") {
    return (
      <Shell>
        {heading("No pudimos cargar la invitación")}
        <p role="alert" className="mt-3 text-sm text-mf-muted">
          {load.message}
        </p>
        <Button
          size="md"
          onClick={() => {
            setLoad({ status: "loading" });
            void fetchPreview();
          }}
          className="mt-6 w-full"
        >
          Reintentar
        </Button>
      </Shell>
    );
  }

  if (load.status !== "ready") return null;
  const { preview } = load;

  if (blocked?.kind === "already") {
    return (
      <Shell>
        {heading("Ya sos parte de esta reunión")}
        <p className="mt-3 text-sm text-mf-muted">
          Tu cuenta ya participa en <strong className="text-mf-navy">{preview.sala.nombre}</strong>.
          Encontrala en Mis reuniones.
        </p>
        <Link href="/agenda" className={buttonClass({ size: "md", className: "mt-6 w-full" })}>
          Ir a Mis reuniones
        </Link>
      </Shell>
    );
  }

  if (blocked?.kind === "mismatch") {
    return (
      <Shell>
        {heading("Esta invitación es para otra cuenta")}
        <p role="alert" className="mt-3 text-sm text-mf-muted">
          Esta invitación es para{" "}
          <strong className="break-all text-mf-navy">{preview.email}</strong>. Iniciaste sesión con
          otra cuenta.
        </p>
        <Button size="md" onClick={() => void handleSwitchAccount()} className="mt-6 w-full">
          Cerrar sesión y continuar
        </Button>
        <Link
          href="/home"
          className={buttonClass({ variant: "ghost", size: "md", className: "mt-2 w-full" })}
        >
          Ir al inicio
        </Link>
      </Shell>
    );
  }

  const intro = (
    <>
      <p className="text-sm font-bold uppercase tracking-widest text-mf-blue">Invitación</p>
      <div className="mt-2">{heading(preview.sala.nombre)}</div>
      <p className="mt-2 text-sm text-mf-muted">
        Te invitaron a esta reunión con{" "}
        <strong className="break-all font-bold text-mf-navy">{preview.email}</strong>.
      </p>
    </>
  );

  const errorBox = formError && (
    <p
      role="alert"
      className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
    >
      {formError}
    </p>
  );

  const authModal = (
    <AuthModal
      open={authOpen}
      onClose={() => setAuthOpen(false)}
      onSuccess={() => setAuthOpen(false)}
    />
  );

  // Invitación a una cuenta registrada (o a un email sin cuenta, pero con sesión iniciada):
  // se acepta con la sesión del usuario.
  if (preview.requiereLogin || isAuthenticated) {
    if (!isAuthenticated) {
      return (
        <Shell>
          {intro}
          <p className="mt-4 text-sm text-mf-muted">
            Iniciá sesión con <strong className="break-all text-mf-navy">{preview.email}</strong>{" "}
            para aceptar.
          </p>
          {errorBox}
          <Button size="md" onClick={() => setAuthOpen(true)} className="mt-6 w-full">
            Iniciar sesión
          </Button>
          {authModal}
        </Shell>
      );
    }
    return (
      <Shell>
        {intro}
        <p className="mt-4 text-sm text-mf-muted">
          Vas a entrar como{" "}
          <strong className="text-mf-navy">
            {user ? `${user.nombre} ${user.apellido}` : "tu cuenta"}
          </strong>
          {user?.email ? ` (${user.email})` : ""}. El anfitrión deberá aprobar tu ingreso.
        </p>
        {errorBox}
        <Button
          size="md"
          onClick={() => void accept()}
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="mt-6 w-full"
        >
          {submitting ? "Aceptando…" : "Aceptar invitación"}
        </Button>
        {!preview.requiereLogin && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => void handleSwitchAccount()}
            disabled={submitting}
            className="mt-2 w-full"
          >
            No soy yo: continuar sin cuenta
          </Button>
        )}
        {authModal}
      </Shell>
    );
  }

  // Invitado sin cuenta ni sesión: pide nombre y apellido.
  return (
    <Shell>
      {intro}
      <form onSubmit={handleGuestSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor={`${baseId}-nombre`} className="block text-sm font-medium text-mf-navy">
            Nombre
          </label>
          <input
            ref={nombreRef}
            id={`${baseId}-nombre`}
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            autoComplete="given-name"
            disabled={submitting}
            aria-invalid={fieldErrors.nombre ? true : undefined}
            aria-describedby={fieldErrors.nombre ? `${baseId}-nombre-error` : undefined}
            className={inputClass(Boolean(fieldErrors.nombre))}
          />
          {fieldErrors.nombre && (
            <p id={`${baseId}-nombre-error`} role="alert" className="mt-1 text-sm text-red-600">
              {fieldErrors.nombre}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${baseId}-apellido`} className="block text-sm font-medium text-mf-navy">
            Apellido
          </label>
          <input
            ref={apellidoRef}
            id={`${baseId}-apellido`}
            value={apellido}
            onChange={(event) => setApellido(event.target.value)}
            autoComplete="family-name"
            disabled={submitting}
            aria-invalid={fieldErrors.apellido ? true : undefined}
            aria-describedby={fieldErrors.apellido ? `${baseId}-apellido-error` : undefined}
            className={inputClass(Boolean(fieldErrors.apellido))}
          />
          {fieldErrors.apellido && (
            <p id={`${baseId}-apellido-error`} role="alert" className="mt-1 text-sm text-red-600">
              {fieldErrors.apellido}
            </p>
          )}
        </div>
        {errorBox}
        <Button
          type="submit"
          size="md"
          disabled={submitting}
          aria-busy={submitting || undefined}
          className="w-full"
        >
          {submitting ? "Aceptando…" : "Unirme a la reunión"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-mf-muted">
        ¿Ya tenés cuenta?{" "}
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="font-bold text-mf-blue focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue"
        >
          Iniciá sesión
        </button>
      </p>
      {authModal}
    </Shell>
  );
}
