import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMailer } from "../mail/console.mailer.js";
import { ResendMailer } from "../mail/resend.mailer.js";

const mensaje = {
  to: "ana@test.com",
  subject: "Te invitaron a una sala",
  text: "Entrá acá: http://localhost:3000/invitacion/TOKEN-SECRETO",
  html: "<a href='http://localhost:3000/invitacion/TOKEN-SECRETO'>Entrar</a>",
};

describe("ConsoleMailer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registra el mensaje completo (con el enlace) fuera de producción y no usa la red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const log = vi.fn();
    const mailer = new ConsoleMailer({ log, nodeEnv: "development" });

    await mailer.send(mensaje);

    expect(log).toHaveBeenCalledTimes(1);
    const salida = String(log.mock.calls[0]![0]);
    expect(salida).toContain("ana@test.com");
    expect(salida).toContain("Te invitaron a una sala");
    expect(salida).toContain("TOKEN-SECRETO");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("en producción no loguea el cuerpo (el token no llega a los logs)", async () => {
    const log = vi.fn();
    const mailer = new ConsoleMailer({ log, nodeEnv: "production" });

    await mailer.send(mensaje);

    expect(log).toHaveBeenCalledTimes(1);
    const salida = String(log.mock.calls[0]![0]);
    expect(salida).toContain("ana@test.com");
    expect(salida).not.toContain("TOKEN-SECRETO");
  });
});

describe("ResendMailer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hace POST a la API de Resend con Bearer, from, to, subject, text y html", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const mailer = new ResendMailer({ apiKey: "re_key", from: "MeetFlow <hola@meetflow.app>" });

    await mailer.send(mensaje);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      from: "MeetFlow <hola@meetflow.app>",
      to: ["ana@test.com"],
      subject: "Te invitaron a una sala",
      text: mensaje.text,
      html: mensaje.html,
    });
  });

  it("una respuesta no-2xx lanza error (sin filtrar el cuerpo del mensaje)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    const mailer = new ResendMailer({ apiKey: "re_key", from: "a@b.com" });

    await expect(mailer.send(mensaje)).rejects.toThrow(/500/);
    await expect(mailer.send(mensaje)).rejects.not.toThrow(/TOKEN-SECRETO/);
  });

  it("propaga el error de red de fetch", async () => {
    const caida = new Error("ECONNRESET");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(caida));
    const mailer = new ResendMailer({ apiKey: "re_key", from: "a@b.com" });

    await expect(mailer.send(mensaje)).rejects.toBe(caida);
  });
});
