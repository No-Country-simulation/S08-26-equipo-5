import { env } from "../config/env.js";
import { ConsoleMailer } from "./console.mailer.js";
import type { MailPort } from "./mail.port.js";
import { ResendMailer } from "./resend.mailer.js";

export type { MailMessage, MailPort } from "./mail.port.js";

let instance: MailPort | null = null;

/** Mailer según MAIL_PROVIDER. Lazy: se instancia en el primer uso. */
export function getMailer(): MailPort {
  if (!instance) {
    instance =
      env.mailProvider === "resend"
        ? new ResendMailer({ apiKey: env.resendApiKey!, from: env.mailFrom })
        : new ConsoleMailer({ nodeEnv: env.nodeEnv });
  }
  return instance;
}

/** Solo para tests: descarta la instancia cacheada. */
export function resetMailerForTests(): void {
  instance = null;
}
