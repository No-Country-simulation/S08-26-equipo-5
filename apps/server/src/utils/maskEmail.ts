/**
 * Enmascara un email para exponerlo en endpoints públicos: primera letra de la
 * parte local + "***" + "@" + dominio completo ("ana@x.com" -> "a***@x.com").
 * Sin arroba devuelve "***": nunca se filtra el valor original.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
