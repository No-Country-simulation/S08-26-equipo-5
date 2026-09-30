import { env } from "../config/env.js";
import { BrevoMailer } from "./brevo.mailer.js";
import { ConsoleMailer } from "./console.mailer.js";
import type { MailPort } from "./mail.port.js";
import { ResendMailer } from "./resend.mailer.js";

export type { MailMessage, MailPort } from "./mail.port.js";

let instance: MailPort | null = null;

/** Mailer según MAIL_PROVIDER. Lazy: se instancia en el primer uso. */
export function getMailer(): MailPort {
  if (!instance) {
    switch (env.mailProvider) {
      case "resend":
        instance = new ResendMailer({ apiKey: env.resendApiKey!, from: env.mailFrom });
        break;
      case "brevo":
        instance = new BrevoMailer({ apiKey: env.brevoApiKey!, from: env.mailFrom });
        break;
      default:
        instance = new ConsoleMailer({ nodeEnv: env.nodeEnv });
    }
  }
  return instance;
}

/** Solo para tests: descarta la instancia cacheada. */
export function resetMailerForTests(): void {
  instance = null;
}
