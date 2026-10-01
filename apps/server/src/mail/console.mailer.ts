import type { MailMessage, MailPort } from "./mail.port.js";

export interface ConsoleMailerOptions {
  log?: (line: string) => void;
  nodeEnv?: string;
}

/**
 * Mailer de desarrollo/test: no usa red, escribe el mensaje en consola para
 * poder copiar el enlace de invitación. En producción NO imprime el cuerpo
 * (el enlace contiene el token): solo destinatario y asunto.
 */
export class ConsoleMailer implements MailPort {
  private readonly log: (line: string) => void;
  private readonly nodeEnv: string;

  constructor(options: ConsoleMailerOptions = {}) {
    this.log = options.log ?? ((line) => console.info(line));
    this.nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  }

  async send(message: MailMessage): Promise<void> {
    if (this.nodeEnv === "production") {
      this.log(`[mail:console] to=${message.to} subject="${message.subject}"`);
      return;
    }
    this.log(
      `[mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`,
    );
  }
}
