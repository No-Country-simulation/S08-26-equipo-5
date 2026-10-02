"use client";

import { useRef, useState, type FormEvent } from "react";
import { useInvitaciones } from "../lib/use-invitaciones";
import type { InvitacionResultado } from "../lib/salas-api";
import { InviteEmailsField, type InviteEmailsFieldHandle } from "./invite-emails-field";
import { InviteResults } from "./invite-results";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

/** "Invitar por correo" desde la agenda: campo de correos + resultado con reintento. */
export function InviteDialog({
  salaId,
  salaTitle,
  onClose,
}: {
  salaId: string;
  salaTitle: string;
  onClose: () => void;
}) {
  const fieldRef = useRef<InviteEmailsFieldHandle>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const { resultados, error, sending, send, retryable } = useInvitaciones(salaId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const list = fieldRef.current?.flush();
    if (!list) return;
    if (list.length === 0) {
      fieldRef.current?.focus();
      return;
    }
    const ok = await send(list);
    if (ok) setEmails([]);
  }

  return (
    <Modal
      title="Invitar por correo"
      description={`Cada persona recibe un enlace personal para unirse a "${salaTitle}".`}
      onClose={onClose}
      dismissible={!sending}
    >
      <form onSubmit={handleSubmit} noValidate className="mt-5">
        <InviteEmailsField ref={fieldRef} emails={emails} onChange={setEmails} disabled={sending} />
        <Button type="submit" size="md" disabled={sending} aria-busy={sending || undefined} className="mt-4 w-full">
          {sending ? "Enviando…" : "Enviar invitaciones"}
        </Button>
      </form>
      <InviteResults
        resultados={resultados}
        retryable={retryable}
        onRetry={(list) => void send(list)}
        sending={sending}
        error={error}
      />
      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="md" onClick={onClose} disabled={sending}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Paso de confirmación tras crear una reunión con invitados cuando algún correo
 * no salió: la reunión ya existe y acá se reintenta sin perderla.
 */
export function InviteOutcomeDialog({
  salaId,
  title,
  initial,
  primaryLabel,
  onPrimary,
}: {
  salaId: string;
  title: string;
  initial: { resultados: InvitacionResultado[]; error: string | null; unsent: string[] };
  primaryLabel: string;
  onPrimary: () => void;
}) {
  const { resultados, error, sending, send, retryable } = useInvitaciones(salaId, initial);
  const allSent = retryable.length === 0 && !error;

  return (
    <Modal
      title={title}
      description={
        allSent
          ? "Todas las invitaciones fueron enviadas."
          : "La reunión ya está creada, pero algunas invitaciones no salieron. Podés reintentarlas ahora o más tarde desde Mis reuniones."
      }
      onClose={onPrimary}
      dismissible={!sending}
    >
      <InviteResults
        resultados={resultados}
        retryable={retryable}
        onRetry={(list) => void send(list)}
        sending={sending}
        error={error}
      />
      <div className="mt-6 flex justify-end">
        <Button size="md" onClick={onPrimary} disabled={sending}>
          {primaryLabel}
        </Button>
      </div>
    </Modal>
  );
}
