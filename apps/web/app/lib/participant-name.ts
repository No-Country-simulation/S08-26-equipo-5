/**
 * Nombre para mostrar de un participante. Los invitados por correo que aún no
 * aceptaron llegan con nombre/apellido en null (contrato PR #104): se muestra
 * el email y, si tampoco hay, "Invitado".
 */
export function displayName(person: {
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
}): string {
  const full = [person.nombre, person.apellido]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return full || person.email?.trim() || "Invitado";
}

/** Iniciales para el avatar; "?" si no hay nada de dónde sacarlas. */
export function initials(person: {
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
}): string {
  const parts = [person.nombre, person.apellido]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0);
  const source = parts.length > 0 ? parts : [person.email?.trim() ?? ""];
  const letters = source
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}

/**
 * Iniciales a partir de un nombre ya armado ("Ana Pérez" -> "AP"). `count`
 * limita cuántas letras devuelve; "?" si el nombre está vacío.
 */
export function initialsFromName(name: string | null | undefined, count: 1 | 2 = 2): string {
  const letters = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, count)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || "?";
}
