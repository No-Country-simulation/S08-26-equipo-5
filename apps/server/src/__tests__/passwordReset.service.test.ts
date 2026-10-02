import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "test",
    frontendUrl: "http://front.test",
    passwordResetTtlMinutes: 30,
    bcryptSaltRounds: 4,
  },
}));

import bcrypt from "bcrypt";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RESPUESTA_FORGOT,
  restablecerPassword,
  solicitarReset,
  validarToken,
  type PasswordResetDeps,
} from "../services/passwordReset.service.js";
import { hashInvitationToken } from "../utils/invitationToken.js";
import { AppError } from "../utils/AppError.js";

const AHORA = new Date("2026-10-02T12:00:00.000Z");
const TOKEN_OK = "A".repeat(43);

function crearDeps() {
  const users = { findByEmailInsensitive: vi.fn() };
  const resets = {
    crearReemplazando: vi.fn(),
    findValidoByTokenHash: vi.fn(),
    consumirYCambiarPassword: vi.fn(),
  };
  const mailer = { send: vi.fn() };
  const deps = { users, resets, mailer } as unknown as PasswordResetDeps;
  return { deps, users, resets, mailer };
}

/** Deja correr las promesas pendientes (los envíos son "fire and forget"). */
const vaciar = () => new Promise((r) => setImmediate(r));

async function errorDe(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("se esperaba un rechazo");
}

describe("solicitarReset", () => {
  let m: ReturnType<typeof crearDeps>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    m = crearDeps();
    m.users.findByEmailInsensitive.mockResolvedValue({
      id: "u1",
      nombre: "Ana",
      apellido: "Pérez",
      email: "ana@x.com",
    });
    m.resets.crearReemplazando.mockResolvedValue(undefined);
    m.mailer.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("expone un mensaje genérico idéntico para existente e inexistente", () => {
    expect(RESPUESTA_FORGOT.message).toBe(
      "Si el email está registrado, te enviamos un enlace para restablecer la contraseña.",
    );
  });

  it("email inexistente: no crea nada, no envía y no falla (sin enumeración)", async () => {
    m.users.findByEmailInsensitive.mockResolvedValue(null);

    await expect(solicitarReset(m.deps, "nadie@x.com")).resolves.toBeUndefined();
    await vaciar();

    expect(m.users.findByEmailInsensitive).toHaveBeenCalledWith("nadie@x.com");
    expect(m.resets.crearReemplazando).not.toHaveBeenCalled();
    expect(m.mailer.send).not.toHaveBeenCalled();
  });

  it("email existente: guarda solo el hash con TTL de 30 min y manda el enlace con el token", async () => {
    await solicitarReset(m.deps, "  Ana@X.com ");

    expect(m.users.findByEmailInsensitive).toHaveBeenCalledWith("ana@x.com");
    expect(m.resets.crearReemplazando).toHaveBeenCalledTimes(1);
    const guardado = m.resets.crearReemplazando.mock.calls[0][0];
    expect(guardado.usuarioId).toBe("u1");
    expect(guardado.expiresAt).toEqual(new Date(AHORA.getTime() + 30 * 60 * 1000));
    expect(guardado.now).toEqual(AHORA);

    expect(m.mailer.send).toHaveBeenCalledTimes(1);
    const mail = m.mailer.send.mock.calls[0][0];
    expect(mail.to).toBe("ana@x.com");
    const token = /restablecer-contrasena\/([A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
    expect(token).toBeTruthy();
    expect(mail.text).toContain(`http://front.test/restablecer-contrasena/${token}`);
    expect(mail.html).toContain(`href="http://front.test/restablecer-contrasena/${token}"`);
    expect(mail.html).toContain("30 minutos");
    // En la base solo el hash; el token en claro nunca se persiste.
    expect(guardado.tokenHash).toBe(hashInvitationToken(token!));
    expect(guardado.tokenHash).not.toBe(token);
  });

  it("reemplaza los pedidos previos en la misma operación y cada pedido genera un token distinto", async () => {
    await solicitarReset(m.deps, "ana@x.com");
    await solicitarReset(m.deps, "ana@x.com");

    expect(m.resets.crearReemplazando).toHaveBeenCalledTimes(2);
    const [a, b] = m.resets.crearReemplazando.mock.calls.map((c) => c[0].tokenHash);
    expect(a).not.toBe(b);
  });

  it("si el correo falla no propaga el error y no loguea el token ni el enlace", async () => {
    m.mailer.send.mockRejectedValue(new Error("proveedor caído"));

    await expect(solicitarReset(m.deps, "ana@x.com")).resolves.toBeUndefined();
    await vaciar();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logueado = errorSpy.mock.calls.flat().join(" ");
    expect(logueado).toContain("proveedor caído");
    expect(logueado).not.toContain("restablecer-contrasena");
  });

  it("no espera al envío: un proveedor lento no cambia el tiempo de respuesta", async () => {
    m.mailer.send.mockReturnValue(new Promise(() => undefined));

    await expect(solicitarReset(m.deps, "ana@x.com")).resolves.toBeUndefined();
    expect(m.mailer.send).toHaveBeenCalledTimes(1);
  });
});

describe("validarToken", () => {
  it("token válido: devuelve valido y el email enmascarado", async () => {
    const m = crearDeps();
    m.resets.findValidoByTokenHash.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });

    const res = await validarToken(m.deps, TOKEN_OK);

    expect(res).toEqual({ valido: true, emailEnmascarado: "a***@x.com" });
    expect(m.resets.findValidoByTokenHash.mock.calls[0][0]).toBe(hashInvitationToken(TOKEN_OK));
  });

  it("desconocido, vencido o usado: mismo 410 RESET_TOKEN_INVALID", async () => {
    const m = crearDeps();
    m.resets.findValidoByTokenHash.mockResolvedValue(null);

    const err = await errorDe(validarToken(m.deps, TOKEN_OK));

    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(410);
    expect(err.code).toBe("RESET_TOKEN_INVALID");
  });

  it.each(["", "corto con espacios", "a/b", "x".repeat(300)])(
    "token con formato imposible (%s): 410 sin consultar la base",
    async (token) => {
      const m = crearDeps();

      const err = await errorDe(validarToken(m.deps, token));

      expect(err.code).toBe("RESET_TOKEN_INVALID");
      expect(m.resets.findValidoByTokenHash).not.toHaveBeenCalled();
    },
  );
});

describe("restablecerPassword", () => {
  let m: ReturnType<typeof crearDeps>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AHORA);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    m = crearDeps();
    m.resets.findValidoByTokenHash.mockResolvedValue({
      id: "r1",
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });
    m.resets.consumirYCambiarPassword.mockResolvedValue({
      usuarioId: "u1",
      email: "ana@x.com",
      nombre: "Ana",
    });
    m.mailer.send.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("consume el token por hash con un bcrypt de la contraseña nueva", async () => {
    await restablecerPassword(m.deps, TOKEN_OK, "nueva-clave-123");

    expect(m.resets.consumirYCambiarPassword).toHaveBeenCalledTimes(1);
    const arg = m.resets.consumirYCambiarPassword.mock.calls[0][0];
    expect(arg.tokenHash).toBe(hashInvitationToken(TOKEN_OK));
    expect(arg.now).toEqual(AHORA);
    expect(arg.passwordHash).not.toBe("nueva-clave-123");
    expect(await bcrypt.compare("nueva-clave-123", arg.passwordHash)).toBe(true);
  });

  it("token inválido o vencido: 410 antes de hashear y sin consumir", async () => {
    m.resets.findValidoByTokenHash.mockResolvedValue(null);

    const err = await errorDe(restablecerPassword(m.deps, TOKEN_OK, "nueva-clave-123"));

    expect(err.statusCode).toBe(410);
    expect(err.code).toBe("RESET_TOKEN_INVALID");
    expect(m.resets.consumirYCambiarPassword).not.toHaveBeenCalled();
  });

  it("doble uso / carrera perdida: el consumo atómico devuelve null y responde 410", async () => {
    m.resets.consumirYCambiarPassword.mockResolvedValue(null);

    const err = await errorDe(restablecerPassword(m.deps, TOKEN_OK, "nueva-clave-123"));

    expect(err.statusCode).toBe(410);
    expect(err.code).toBe("RESET_TOKEN_INVALID");
    expect(m.mailer.send).not.toHaveBeenCalled();
  });

  it("dos usos concurrentes del mismo token: solo uno triunfa", async () => {
    let usado = false;
    m.resets.consumirYCambiarPassword.mockImplementation(async () => {
      if (usado) return null;
      usado = true;
      return { usuarioId: "u1", email: "ana@x.com", nombre: "Ana" };
    });

    const resultados = await Promise.allSettled([
      restablecerPassword(m.deps, TOKEN_OK, "clave-uno-123"),
      restablecerPassword(m.deps, TOKEN_OK, "clave-dos-123"),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rechazo.reason.code).toBe("RESET_TOKEN_INVALID");
  });

  it("avisa por correo que la contraseña cambió", async () => {
    await restablecerPassword(m.deps, TOKEN_OK, "nueva-clave-123");
    await vaciar();

    expect(m.mailer.send).toHaveBeenCalledTimes(1);
    const mail = m.mailer.send.mock.calls[0][0];
    expect(mail.to).toBe("ana@x.com");
    expect(mail.subject).toBe("Tu contraseña de MeetFlow fue cambiada");
    expect(mail.html).toContain("http://front.test/login");
  });

  it("si el aviso falla, el cambio de contraseña igual termina bien", async () => {
    m.mailer.send.mockRejectedValue(new Error("smtp caído"));

    await expect(
      restablecerPassword(m.deps, TOKEN_OK, "nueva-clave-123"),
    ).resolves.toBeUndefined();
    await vaciar();
  });
});
