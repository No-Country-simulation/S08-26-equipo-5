export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Puerto de salida de correo. Si el envío falla, `send` rechaza. */
export interface MailPort {
  send(message: MailMessage): Promise<void>;
}
