import type { MailMessage, MailPort } from "./mail.port.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export interface BrevoMailerOptions {
  apiKey: string;
  /** "Nombre <email>" o email plano (formato de MAIL_FROM). */
  from: string;
}

export interface BrevoSender {
  name?: string;
  email: string;
}

/** Convierte MAIL_FROM a la forma de objeto que exige Brevo. */
export function parseSender(from: string): BrevoSender {
  const raw = from.trim();
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(raw);
  if (!match) return { email: raw };
  const name = match[1]!.trim().replace(/^"(.*)"$/, "$1").trim();
  const email = match[2]!.trim();
  return name ? { name, email } : { email };
}

/** Envío vía API transaccional de Brevo con fetch nativo (sin dependencias nuevas). */
export class BrevoMailer implements MailPort {
  constructor(private readonly options: BrevoMailerOptions) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": this.options.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: parseSender(this.options.from),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
    });

    if (!response.ok) {
      // Solo el status: el cuerpo de la respuesta puede eco-ar datos del mensaje.
      throw new Error(`Brevo respondió ${response.status}`);
    }
  }
}
