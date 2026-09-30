import { afterEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  mailProvider: "console" as "console" | "resend" | "brevo",
  resendApiKey: undefined as string | undefined,
  brevoApiKey: undefined as string | undefined,
  mailFrom: "onboarding@resend.dev",
  nodeEnv: "test",
}));
vi.mock("../config/env.js", () => ({ env: envMock }));

import { getMailer, resetMailerForTests } from "../mail/index.js";
import { ConsoleMailer } from "../mail/console.mailer.js";
import { BrevoMailer } from "../mail/brevo.mailer.js";
import { ResendMailer } from "../mail/resend.mailer.js";

describe("getMailer", () => {
  afterEach(() => {
    resetMailerForTests();
    envMock.mailProvider = "console";
    envMock.resendApiKey = undefined;
    envMock.brevoApiKey = undefined;
  });

  it("MAIL_PROVIDER=console devuelve ConsoleMailer", () => {
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
  });

  it("MAIL_PROVIDER=resend devuelve ResendMailer", () => {
    envMock.mailProvider = "resend";
    envMock.resendApiKey = "re_key";

    expect(getMailer()).toBeInstanceOf(ResendMailer);
  });

  it("MAIL_PROVIDER=brevo devuelve BrevoMailer", () => {
    envMock.mailProvider = "brevo";
    envMock.brevoApiKey = "xkeysib-key";

    expect(getMailer()).toBeInstanceOf(BrevoMailer);
  });

  it("es lazy y cachea la instancia", () => {
    expect(getMailer()).toBe(getMailer());
  });
});
