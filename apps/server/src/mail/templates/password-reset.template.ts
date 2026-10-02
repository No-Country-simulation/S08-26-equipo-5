/**
 * Correos de recuperación de contraseña: el enlace para restablecerla y el
 * aviso posterior de que fue cambiada.
 *
 * Misma identidad que invitacion.template.ts: HTML de correo (tablas + estilos
 * inline, sin CSS externo ni SVG), logo PNG sobre encabezado navy y barra amarilla.
 */
import { LOGO_URL, escapeHtml } from "./invitacion.template.js";

const color = {
  blue: "#3D4ED7",
  yellow: "#F3E477",
  light: "#F4F5F8",
  navy: "#20274F",
  white: "#FFFFFF",
  muted: "#5B6180",
  border: "#E3E5EC",
} as const;

const FONT = "Arimo, Arial, Helvetica, sans-serif";

export interface PasswordResetEmailParams {
  /** Nombre del usuario (lo carga él mismo: se escapa). */
  nombre?: string | null;
  link: string;
  minutos: number;
}

export interface PasswordChangedEmailParams {
  nombre?: string | null;
  /** Enlace a iniciar sesión / pedir un nuevo restablecimiento. */
  loginUrl: string;
}

export interface PasswordEmail {
  subject: string;
  text: string;
  html: string;
}

interface LayoutParams {
  title: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  /** HTML ya escapado. */
  bodyHtml: string;
  cta?: { label: string; link: string };
  footerHtml: string;
  afterFooterHtml: string;
}

function saludo(nombre?: string | null): { text: string; html: string } {
  const limpio = nombre?.trim();
  return limpio
    ? { text: `Hola ${limpio},`, html: `Hola ${escapeHtml(limpio)},` }
    : { text: "Hola,", html: "Hola," };
}

function layout(p: LayoutParams): string {
  const link = p.cta ? escapeHtml(p.cta.link) : "";
  const label = p.cta ? escapeHtml(p.cta.label) : "";

  const ctaBlock = p.cta
    ? `        <tr>
          <td align="center" style="padding:24px 32px 32px 32px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" stroke="f" fillcolor="${color.blue}">
              <center style="color:${color.white};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${link}" target="_blank" style="display:inline-block;background-color:${color.blue};color:${color.white};font-family:${FONT};font-size:16px;line-height:24px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">${label}</a>
            <!--<![endif]-->
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px 32px;font-family:${FONT};">
            <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${color.muted};">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
            <p style="margin:0;font-size:14px;line-height:20px;word-break:break-all;"><a href="${link}" target="_blank" style="color:${color.blue};text-decoration:underline;">${link}</a></p>
          </td>
        </tr>
`
    : "";

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(p.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${color.light};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${color.light};">${escapeHtml(p.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.light};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${color.white};border-radius:12px;overflow:hidden;border:1px solid ${color.border};">
        <tr>
          <td align="center" style="background-color:${color.navy};padding:32px 24px;">
            <img src="${LOGO_URL}" width="180" height="60" alt="MeetFlow" style="display:block;border:0;outline:none;text-decoration:none;width:180px;height:60px;color:${color.white};font-family:${FONT};font-size:28px;font-weight:700;">
          </td>
        </tr>
        <tr>
          <td style="background-color:${color.yellow};height:4px;line-height:4px;font-size:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:48px 32px 16px 32px;font-family:${FONT};color:${color.navy};">
            <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${color.muted};">${escapeHtml(p.eyebrow)}</p>
            <h1 style="margin:0 0 24px 0;font-size:24px;line-height:32px;font-weight:400;color:${color.navy};">${escapeHtml(p.heading)}</h1>
            <p style="margin:0;font-size:16px;line-height:24px;color:${color.navy};">${p.bodyHtml}</p>
          </td>
        </tr>
${ctaBlock}        <tr>
          <td style="padding:16px 32px;border-top:1px solid ${color.border};font-family:${FONT};">
            <p style="margin:0;font-size:14px;line-height:20px;color:${color.navy};">${p.footerHtml}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:24px 16px;font-family:${FONT};font-size:12px;line-height:16px;color:${color.muted};">
            ${p.afterFooterHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderPasswordResetEmail(params: PasswordResetEmailParams): PasswordEmail {
  const hola = saludo(params.nombre);
  const subject = "Restablecé tu contraseña de MeetFlow";

  const text =
    `${hola.text}\n\n` +
    "Recibimos un pedido para restablecer la contraseña de tu cuenta de MeetFlow.\n\n" +
    `Creá una nueva desde este enlace: ${params.link}\n\n` +
    `El enlace es personal, se puede usar una sola vez y vence en ${params.minutos} minutos.\n\n` +
    "Si no lo pediste vos, ignorá este correo: tu contraseña no cambia.";

  const html = layout({
    title: subject,
    preheader: `Creá una nueva contraseña. El enlace vence en ${params.minutos} minutos.`,
    eyebrow: "Cuenta de MeetFlow",
    heading: "Restablecé tu contraseña",
    bodyHtml: `${hola.html}<br><br>Recibimos un pedido para restablecer la contraseña de tu cuenta. Tocá el botón para crear una nueva.`,
    cta: { label: "Restablecer contraseña", link: params.link },
    footerHtml: `El enlace es <strong>personal</strong>, se usa una sola vez y vence en <strong>${params.minutos} minutos</strong>. No lo compartas.`,
    afterFooterHtml:
      "Si no lo pediste vos, ignorá este correo: tu contraseña no cambia.<br>Recibiste este mensaje porque alguien pidió restablecer la contraseña de esta cuenta.",
  });

  return { subject, text, html };
}

export function renderPasswordChangedEmail(params: PasswordChangedEmailParams): PasswordEmail {
  const hola = saludo(params.nombre);
  const subject = "Tu contraseña de MeetFlow fue cambiada";

  const text =
    `${hola.text}\n\n` +
    "La contraseña de tu cuenta de MeetFlow se cambió hace un momento. Cerramos las sesiones en tus otros dispositivos; pueden tardar hasta 15 minutos en cerrarse por completo.\n\n" +
    `Si no fuiste vos, restablecela de inmediato desde ${params.loginUrl} y revisá la seguridad de tu correo.`;

  const html = layout({
    title: subject,
    preheader: "La contraseña de tu cuenta se cambió. Las sesiones en otros dispositivos se cierran en hasta 15 minutos.",
    eyebrow: "Cuenta de MeetFlow",
    heading: "Tu contraseña fue cambiada",
    bodyHtml: `${hola.html}<br><br>La contraseña de tu cuenta se cambió hace un momento. Cerramos las sesiones en tus otros dispositivos; pueden tardar hasta 15 minutos en cerrarse por completo.`,
    footerHtml: `Si no fuiste vos, restablecela de inmediato desde <a href="${escapeHtml(params.loginUrl)}" target="_blank" style="color:${color.blue};text-decoration:underline;">${escapeHtml(params.loginUrl)}</a> y revisá la seguridad de tu correo.`,
    afterFooterHtml: "Te avisamos porque cambió la contraseña de tu cuenta de MeetFlow.",
  });

  return { subject, text, html };
}
