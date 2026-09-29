const SESSION_KEY = "meetflow.guest";

export type GuestSession = {
  accessToken: string;
  participanteId: string;
  salaId: string;
};

export function saveGuestSession(session: GuestSession) {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getGuestSession(): GuestSession | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "accessToken" in value &&
      typeof value.accessToken === "string" &&
      "participanteId" in value &&
      typeof value.participanteId === "string" &&
      "salaId" in value &&
      typeof value.salaId === "string"
    ) {
      return {
        accessToken: value.accessToken,
        participanteId: value.participanteId,
        salaId: value.salaId,
      };
    }
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }

  window.sessionStorage.removeItem(SESSION_KEY);
  return null;
}

export function updateGuestSessionToken(accessToken: string) {
  const session = getGuestSession();
  if (!session) return;
  saveGuestSession({ ...session, accessToken });
}

export function clearGuestSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}
