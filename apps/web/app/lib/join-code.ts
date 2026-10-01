/**
 * Parseo y validación del código de invitación que el usuario pega en el
 * home: puede ser el código pelado (ej. "ABCD1234", eventualmente con
 * guiones para legibilidad) o un enlace completo copiado del host
 * (ej. "https://.../sala/ABCD1234" o "...?codigo=ABCD1234").
 *
 * No reemplaza la validación real del servidor (GET /salas/:code, que
 * responde 404 si el código no existe) — es solo un filtro rápido para
 * no pegarle a la API con basura evidente y mostrar un error inline al
 * toque, antes de esperar un round-trip de red.
 */

// Alfanumérico, 4 a 40 caracteres una vez removidos separadores comunes
// (guiones, espacios). Los códigos reales que genera el backend son 8
// caracteres (4 letras + 4 números, ver rooms.controller.ts), pero se deja
// margen para no romper si el formato cambia.
const CODE_PATTERN = /^[A-Z0-9]{4,40}$/;

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.includes("://");
}

function extractFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const fromQuery =
      url.searchParams.get("codigo") ?? url.searchParams.get("code");
    if (fromQuery) return fromQuery;

    const segments = url.pathname.split("/").filter(Boolean);
    return segments.at(-1) ?? null;
  } catch {
    return null;
  }
}

/**
 * Extrae y normaliza el código de invitación a partir de lo que el usuario
 * haya pegado (código pelado, con guiones, o un enlace completo).
 * Devuelve `null` si no se puede extraer nada con forma de código válida.
 */
export function parseJoinInput(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const candidate = looksLikeUrl(trimmed)
    ? extractFromUrl(trimmed)
    : trimmed;

  if (!candidate) return null;

  const normalized = candidate.replace(/[\s-]/g, "").toUpperCase();
  return CODE_PATTERN.test(normalized) ? normalized : null;
}
