import type { MailMessage, MailPort } from "./mail.port.js";

const RESEND_URL = "https://api.resend.com/emails";

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
}

/** Envío vía API HTTP de Resend con fetch nativo (sin dependencias nuevas). */
export class ResendMailer implements MailPort {
  constructor(private readonly options: ResendMailerOptions) {}

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // Solo el status: el cuerpo de la respuesta puede eco-ar datos del mensaje.
      throw new Error(`Resend respondió ${response.status}`);
    }
  }
}
