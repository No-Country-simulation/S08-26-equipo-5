/**
 * Valida el parámetro `next` de /login para evitar open redirect.
 *
 * Solo acepta rutas internas: empiezan con una única "/" (no "//" ni "/\",
 * que el navegador interpreta como URL con host) y no contienen caracteres
 * de control (tab, CR, LF, etc., que los navegadores descartan al parsear).
 *
 * Ejemplos:
 *   esRutaInternaSegura("/home")                // true
 *   esRutaInternaSegura("/invitacion/abc?x=1")  // true
 *   esRutaInternaSegura("//evil.com")           // false
 *   esRutaInternaSegura("/\\evil.com")          // false (barra invertida)
 *   esRutaInternaSegura("https://evil.com")     // false
 *   esRutaInternaSegura("/<TAB>/evil.com")      // false (caracter de control)
 */
const RUTA_INTERNA = /^\/(?![\/\\])/;
const CARACTER_DE_CONTROL = /[\u0000-\u001f\u007f]/;

export function esRutaInternaSegura(next: string | null | undefined): next is string {
  return (
    typeof next === "string" &&
    RUTA_INTERNA.test(next) &&
    !CARACTER_DE_CONTROL.test(next)
  );
}

/** Devuelve `next` si es una ruta interna segura; si no, el fallback. */
export function rutaDestinoSegura(next: string | null | undefined, fallback = "/home"): string {
  return esRutaInternaSegura(next) ? next : fallback;
}
