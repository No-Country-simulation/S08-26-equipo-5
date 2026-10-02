import { esRutaInternaSegura } from "./safe-redirect";

/** Mismas reglas que el registro (backend: mínimo 8 caracteres). */
export const PASSWORD_MIN_LENGTH = 8;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Segundos que se espera antes de poder reenviar el correo. */
export const RESEND_COOLDOWN_SECONDS = 60;

const CONTEXT_KEY = "meetflow.recovery";

export type RecoveryContext = {
  /** Email tipeado en el login, para no volver a pedirlo. */
  email?: string;
  /** Ruta interna a la que volver al iniciar sesión (ej. una invitación). */
  next?: string;
};

/**
 * Pasa el email y el destino de un paso al otro sin ponerlos en la URL
 * (sessionStorage: solo esta pestaña y se borra al cerrarla). Nunca falla:
 * sin storage la recuperación funciona igual, solo sin el prellenado.
 */
export function saveRecoveryContext(context: RecoveryContext) {
  try {
    const clean: RecoveryContext = {};
    const email = context.email?.trim();
    if (email) clean.email = email;
    if (esRutaInternaSegura(context.next)) clean.next = context.next;
    if (clean.email || clean.next) {
      window.sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(clean));
    } else {
      window.sessionStorage.removeItem(CONTEXT_KEY);
    }
  } catch {
    // Storage no disponible (modo privado, cuota): se ignora.
  }
}

export function readRecoveryContext(): RecoveryContext {
  try {
    const raw = window.sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as RecoveryContext;
    return {
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      next: esRutaInternaSegura(parsed.next) ? parsed.next : undefined,
    };
  } catch {
    return {};
  }
}

export function clearRecoveryContext() {
  try {
    window.sessionStorage.removeItem(CONTEXT_KEY);
  } catch {
    // ver saveRecoveryContext
  }
}
