import { afterEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  mailProvider: "console" as "console" | "resend",
  resendApiKey: undefined as string | undefined,
  mailFrom: "onboarding@resend.dev",
  nodeEnv: "test",
}));
vi.mock("../config/env.js", () => ({ env: envMock }));

import { getMailer, resetMailerForTests } from "../mail/index.js";
import { ConsoleMailer } from "../mail/console.mailer.js";
import { ResendMailer } from "../mail/resend.mailer.js";

describe("getMailer", () => {
  afterEach(() => {
    resetMailerForTests();
    envMock.mailProvider = "console";
    envMock.resendApiKey = undefined;
  });

  it("MAIL_PROVIDER=console devuelve ConsoleMailer", () => {
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
  });

  it("MAIL_PROVIDER=resend devuelve ResendMailer", () => {
    envMock.mailProvider = "resend";
    envMock.resendApiKey = "re_key";

    expect(getMailer()).toBeInstanceOf(ResendMailer);
  });

  it("es lazy y cachea la instancia", () => {
    expect(getMailer()).toBe(getMailer());
  });
});
