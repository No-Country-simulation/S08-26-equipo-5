import {
  ApiRequestError,
  invitarASala,
  MAX_INVITACIONES_POR_SOLICITUD,
  type InvitacionResultado,
} from "./salas-api";

/** Formato mínimo razonable; la validación real la hace el backend. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email);
}

/** Separadores al pegar o tipear: coma, punto y coma, espacios y saltos de línea. */
export function splitEmailInput(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

export type MergeEmailsResult = {
  emails: string[];
  invalid: string[];
  overflow: string[];
};

/**
 * Suma los emails de `raw` a `existing`: normaliza (trim + minúsculas), descarta
 * duplicados en silencio, separa los de formato inválido y los que exceden `max`.
 */
export function mergeEmails(
  raw: string,
  existing: string[],
  max = MAX_INVITACIONES_POR_SOLICITUD,
): MergeEmailsResult {
  const emails = [...existing];
  const invalid: string[] = [];
  const overflow: string[] = [];

  for (const token of splitEmailInput(raw)) {
    if (emails.includes(token)) continue;
    if (!isValidEmail(token)) invalid.push(token);
    else if (emails.length >= max) overflow.push(token);
    else emails.push(token);
  }

  return { emails, invalid, overflow };
}

/** Emails de una respuesta cuyo correo no salió y que se pueden reintentar. */
export function failedEmails(resultados: InvitacionResultado[]): string[] {
  return resultados
    .filter((item) => item.estado !== "YA_PARTICIPA" && !item.emailEnviado)
    .map((item) => item.email);
}

/** Pisa por email los resultados previos con los de un reintento. */
export function mergeResultados(
  previous: InvitacionResultado[],
  next: InvitacionResultado[],
): InvitacionResultado[] {
  const byEmail = new Map(next.map((item) => [item.email, item]));
  const merged = previous.map((item) => byEmail.get(item.email) ?? item);
  const known = new Set(previous.map((item) => item.email));
  return [...merged, ...next.filter((item) => !known.has(item.email))];
}

export function describeInviteError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case "RATE_LIMITED":
        return "Enviaste demasiadas invitaciones. Esperá unos minutos e intentá de nuevo.";
      case "HOST_ONLY":
        return "Solo el anfitrión de la reunión puede invitar por correo.";
      case "ROOM_CANCELLED":
        return "La reunión fue cancelada: ya no se puede invitar.";
      case "ROOM_FINISHED":
        return "La reunión ya finalizó: ya no se puede invitar.";
      case "VALIDATION_ERROR":
        return "Revisá los correos: alguno tiene un formato inválido.";
    }
    return error.message;
  }
  return "No se pudieron enviar las invitaciones. Intentá de nuevo.";
}

export type InviteOutcome = {
  resultados: InvitacionResultado[];
  error: string | null;
  /** Emails que no llegaron a procesarse porque la llamada entera falló. */
  unsent: string[];
  /** true si no hay nada que reintentar. */
  allSent: boolean;
};

/**
 * Invita a `emails` justo después de crear una reunión. Nunca lanza: la reunión
 * ya existe, así que un fallo se devuelve para mostrarlo y poder reintentar.
 */
export async function inviteAfterCreate(salaId: string, emails: string[]): Promise<InviteOutcome> {
  try {
    const { resultados } = await invitarASala(salaId, emails);
    return { resultados, error: null, unsent: [], allSent: failedEmails(resultados).length === 0 };
  } catch (error) {
    return { resultados: [], error: describeInviteError(error), unsent: emails, allSent: false };
  }
}
