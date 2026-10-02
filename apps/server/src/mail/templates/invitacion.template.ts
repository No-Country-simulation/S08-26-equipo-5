/**
 * Correo de invitación a una sala.
 *
 * HTML de correo, no de web: tablas + estilos inline, sin CSS externo ni SVG
 * (Gmail y Outlook no los respetan). Colores y tipografía salen de los design
 * tokens de MeetFlow (meetflow.tokens.json).
 */

/**
 * Logo en PNG (180x60, ~6.5 KB). Los clientes de correo no muestran SVG, por
 * eso no se usa el logo vectorial. Es blanco: va sobre el encabezado navy.
 */
export const LOGO_URL =
  "https://res.cloudinary.com/dsiizolgq/image/upload/v1790777798/Imagen_de_ChatGPT_26_sept_2026_20_06_45_1_byfv9h.png";

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

export interface InvitacionEmailParams {
  salaNombre: string;
  /** Nombre visible del host; si no se conoce se usa un texto neutro. */
  hostNombre?: string | null;
  link: string;
  horas: number;
}

export interface InvitacionEmail {
  subject: string;
  text: string;
  html: string;
}

/** El nombre de la sala y del host los carga un usuario: nunca van crudos al HTML. */
export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInvitacionEmail(params: InvitacionEmailParams): InvitacionEmail {
  const hostNombre = params.hostNombre?.trim() || null;
  const quienInvita = hostNombre ? `${hostNombre} te invitó` : "Te invitaron";

  const subject = `Te invitaron a la sala "${params.salaNombre}"`;

  const text =
    `${quienInvita} a unirte a la sala "${params.salaNombre}" en MeetFlow.\n\n` +
    `Ingresá desde este enlace: ${params.link}\n\n` +
    `El enlace es personal y vence en ${params.horas} horas.`;

  const sala = escapeHtml(params.salaNombre);
  const link = escapeHtml(params.link);
  const titulo = hostNombre
    ? `<strong>${escapeHtml(hostNombre)}</strong> te invitó a una reunión`
    : "Te invitaron a una reunión";
  const preheader = `${escapeHtml(quienInvita)} a la sala "${sala}". El enlace vence en ${params.horas} horas.`;

  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${color.light};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${color.light};">${preheader}</div>
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
            <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${color.muted};">Invitación a MeetFlow</p>
            <h1 style="margin:0 0 24px 0;font-size:24px;line-height:32px;font-weight:400;color:${color.navy};">${titulo}</h1>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${color.light};border-radius:8px;">
              <tr>
                <td style="padding:16px 24px;font-family:${FONT};">
                  <p style="margin:0 0 4px 0;font-size:12px;line-height:16px;color:${color.muted};text-transform:uppercase;letter-spacing:0.5px;">Sala</p>
                  <p style="margin:0;font-size:20px;line-height:28px;font-weight:700;color:${color.navy};">${sala}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 32px 32px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${link}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" stroke="f" fillcolor="${color.blue}">
              <center style="color:${color.white};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Unirme a la reunión</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${link}" target="_blank" style="display:inline-block;background-color:${color.blue};color:${color.white};font-family:${FONT};font-size:16px;line-height:24px;font-weight:700;text-decoration:none;padding:12px 32px;border-radius:8px;">Unirme a la reunión</a>
            <!--<![endif]-->
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px 32px;font-family:${FONT};">
            <p style="margin:0 0 8px 0;font-size:14px;line-height:20px;color:${color.muted};">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
            <p style="margin:0;font-size:14px;line-height:20px;word-break:break-all;"><a href="${link}" target="_blank" style="color:${color.blue};text-decoration:underline;">${link}</a></p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid ${color.border};font-family:${FONT};">
            <p style="margin:0;font-size:14px;line-height:20px;color:${color.navy};">El enlace es <strong>personal</strong> y vence en <strong>${params.horas} horas</strong>. No lo compartas.</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:24px 16px;font-family:${FONT};font-size:12px;line-height:16px;color:${color.muted};">
            Recibiste este correo porque alguien te invitó a una sala de MeetFlow.<br>Si no esperabas esta invitación, podés ignorarlo.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
