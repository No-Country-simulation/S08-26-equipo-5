const GENERIC_MIC_WORDS = new Set([
  "default",
  "communications",
  "communication",
  "audio",
  "input",
  "microphone",
  "microfono",
  "mic",
  "device",
  "dispositivo",
]);

export type MicClaim = {
  sessionId: string;
  label: string;
  active: boolean;
  since: number;
};

export function normalizeMicLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_MIC_WORDS.has(token))
    .join(" ");
}

/** Sin nombre de dispositivo se trata como el mismo micrófono: no se puede distinguir. */
export function isSameMicrophone(left: string, right: string): boolean {
  const a = normalizeMicLabel(left);
  const b = normalizeMicLabel(right);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = a.split(" ").filter((token) => token.length >= 4);
  return tokens.some((token) => b.split(" ").includes(token));
}

export async function readSelectedMicLabel(deviceId: string | undefined): Promise<string> {
  if (!navigator.mediaDevices?.enumerateDevices) return "";
  const devices = await navigator.mediaDevices.enumerateDevices();
  const match = devices.find((device) => (
    device.kind === "audioinput" && device.deviceId === deviceId
  ));
  return match?.label ?? "";
}

export function otherSessionHoldsSameMic(
  sessions: Array<{ sessionId: string; publishingAudio: boolean }>,
  localSessionId: string | undefined,
  localLabel: string,
  claims: ReadonlyMap<string, MicClaim>,
): boolean {
  for (const session of sessions) {
    if (session.sessionId === localSessionId || !session.publishingAudio) continue;
    const claim = claims.get(session.sessionId);
    if (!claim || isSameMicrophone(localLabel, claim.label)) return true;
  }

  for (const claim of claims.values()) {
    if (!claim.active || claim.sessionId === localSessionId) continue;
    if (isSameMicrophone(localLabel, claim.label)) return true;
  }

  return false;
}
