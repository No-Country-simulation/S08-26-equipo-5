"use client";

import { useCallback, useRef, useState } from "react";
import { invitarASala, type InvitacionResultado } from "./salas-api";
import { describeInviteError, failedEmails, mergeResultados } from "./invite-emails";

type Initial = { resultados?: InvitacionResultado[]; error?: string | null; unsent?: string[] };

/**
 * Estado de envío de invitaciones de una sala. Conserva los resultados por email
 * (los reintentos pisan los anteriores) y los emails que no llegaron a enviarse
 * porque la llamada entera falló (red, 429, etc.), para poder reintentarlos.
 */
export function useInvitaciones(salaId: string, initial: Initial = {}) {
  const [resultados, setResultados] = useState<InvitacionResultado[]>(initial.resultados ?? []);
  const [unsent, setUnsent] = useState<string[]>(initial.unsent ?? []);
  const [error, setError] = useState<string | null>(initial.error ?? null);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  const send = useCallback(
    async (emails: string[]) => {
      if (busy.current || emails.length === 0) return false;
      busy.current = true;
      setSending(true);
      setError(null);
      try {
        const response = await invitarASala(salaId, emails);
        setResultados((current) => mergeResultados(current, response.resultados));
        setUnsent((current) => current.filter((email) => !emails.includes(email)));
        return true;
      } catch (requestError) {
        setError(describeInviteError(requestError));
        setUnsent((current) => [...new Set([...current, ...emails])]);
        return false;
      } finally {
        busy.current = false;
        setSending(false);
      }
    },
    [salaId],
  );

  const retryable = [...new Set([...unsent, ...failedEmails(resultados)])];

  return { resultados, error, sending, send, retryable };
}
