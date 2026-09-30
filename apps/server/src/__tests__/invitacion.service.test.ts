import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "test",
    frontendUrl: "http://front.test",
    invitacionTtlHoras: 72,
  },
}));

vi.mock("@prisma/client", () => ({
  EstadoParticipante: {
    INVITADO: "INVITADO",
    PENDIENTE: "PENDIENTE",
    APROBADO: "APROBADO",
    RECHAZADO: "RECHAZADO",
  },
  RolParticipante: { HOST: "HOST", PARTICIPANTE: "PARTICIPANTE" },
}));

import { describe, it, expect, beforeEach } from "vitest";
import {
  invitar,
  previewInvitacion,
  MAX_INVITES,
  type InvitacionDeps,
} from "../services/invitacion.service.js";
import { hashInvitationToken } from "../utils/invitationToken.js";
import { AppError } from "../utils/AppError.js";

const SALA_ID = "sala-1";
const HOST_ID = "host-1";

function crearDeps() {
  const participantes = {
    findHost: vi.fn(),
    findByEmail: vi.fn(),
    findByUsuario: vi.fn(),
  };
  const invitaciones = {
    crearInvitado: vi.fn(),
    rotarToken: vi.fn(),
    findByTokenHash: vi.fn(),
  };
  const salas = { findById: vi.fn() };
  const usuarios = { findByEmailInsensitive: vi.fn() };
  const mailer = { send: vi.fn() };
  const deps = { participantes, invitaciones, salas, usuarios, mailer } as unknown as InvitacionDeps;
  return { deps, participantes, invitaciones, salas, usuarios, mailer };
}

describe("invitar", () => {
  let m: ReturnType<typeof crearDeps>;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    m = crearDeps();
    m.salas.findById.mockResolvedValue({ id: SALA_ID, nombre: "Sala Q4", estado: "ACTIVA" });
    m.participantes.findHost.mockResolvedValue({ id: "p-host" });
    m.participantes.findByEmail.mockResolvedValue(null);
    m.participantes.findByUsuario.mockResolvedValue(null);
    m.usuarios.findByEmailInsensitive.mockResolvedValue(null);
    m.invitaciones.crearInvitado.mockResolvedValue({ id: "p-new" });
    m.mailer.send.mockResolvedValue(undefined);
  });

  it("normaliza y deduplica: un solo INVITADO, una invitacion y un mail", async () => {
    const res = await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["A@x.com ", " a@x.com"],
    });

    expect(m.invitaciones.crearInvitado).toHaveBeenCalledTimes(1);
    expect(m.invitaciones.crearInvitado.mock.calls[0][0]).toMatchObject({
      salaId: SALA_ID,
      email: "a@x.com",
      usuarioId: null,
      nombre: null,
      apellido: null,
      invitadoPorId: HOST_ID,
    });
    expect(m.mailer.send).toHaveBeenCalledTimes(1);
    expect(res.resultados).toEqual([
      { email: "a@x.com", estado: "INVITADO", emailEnviado: true },
    ]);
  });

  it("manda el correo en HTML con el enlace y el nombre del host", async () => {
    m.participantes.findHost.mockResolvedValue({ id: "p-host", nombre: "Ana", apellido: "Pérez" });

    await invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails: ["a@x.com"] });

    const mail = m.mailer.send.mock.calls[0][0];
    const token = /\/invitacion\/([\w-]+)/.exec(mail.text)?.[1];
    expect(mail.html).toContain(`href="http://front.test/invitacion/${token}"`);
    expect(mail.html).toContain("Ana Pérez");
    expect(mail.html).toContain("Sala Q4");
    expect(mail.text).toContain("Ana Pérez te invitó");
  });

  it("solo persiste el hash del token; el enlace lleva el token en claro", async () => {
    await invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails: ["a@x.com"] });

    const data = m.invitaciones.crearInvitado.mock.calls[0][0];
    const mail = m.mailer.send.mock.calls[0][0];
    const token = /\/invitacion\/([\w-]+)/.exec(mail.text)?.[1];

    expect(mail.to).toBe("a@x.com");
    expect(mail.text).toContain("http://front.test/invitacion/");
    expect(token).toBeTruthy();
    expect(data.tokenHash).toBe(hashInvitationToken(token!));
    expect(JSON.stringify(data)).not.toContain(token!);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 71 * 3600 * 1000);
  });

  it("usuario registrado: vincula usuarioId y datos de cuenta, misma forma de resultado", async () => {
    m.usuarios.findByEmailInsensitive.mockResolvedValue({
      id: "u-1",
      nombre: "Ana",
      apellido: "Paz",
      email: "Ana@x.com",
    });

    const res = await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["ana@x.com", "nuevo@x.com"],
    });

    expect(m.invitaciones.crearInvitado.mock.calls[0][0]).toMatchObject({
      usuarioId: "u-1",
      nombre: "Ana",
      apellido: "Paz",
    });
    expect(Object.keys(res.resultados[0]).sort()).toEqual(Object.keys(res.resultados[1]).sort());
    expect(res.resultados.map((r) => r.estado)).toEqual(["INVITADO", "INVITADO"]);
  });

  it("no host -> 403 y sin efectos", async () => {
    m.participantes.findHost.mockResolvedValue(null);

    await expect(
      invitar(m.deps, { salaId: SALA_ID, hostUserId: "otro", emails: ["a@x.com"] }),
    ).rejects.toMatchObject({ statusCode: 403, code: "HOST_ONLY" });
    expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
    expect(m.mailer.send).not.toHaveBeenCalled();
  });

  it("sala inexistente -> 404", async () => {
    m.salas.findById.mockResolvedValue(null);

    await expect(
      invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails: ["a@x.com"] }),
    ).rejects.toMatchObject({ statusCode: 404, code: "ROOM_NOT_FOUND" });
  });

  it("sala cancelada -> 409", async () => {
    m.salas.findById.mockResolvedValue({ id: SALA_ID, nombre: "S", estado: "CANCELADA" });

    await expect(
      invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails: ["a@x.com"] }),
    ).rejects.toMatchObject({ statusCode: 409, code: "ROOM_CANCELLED" });
  });

  it.each([
    ["vacio", []],
    ["no es array", "a@x.com"],
    ["undefined", undefined],
    ["elemento no string", [1]],
    ["formato invalido", ["no-es-mail"]],
    ["solo espacios", ["   "]],
  ])("emails %s -> 400 sin efectos", async (_n, emails) => {
    await expect(
      invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
  });

  it("mas de MAX_INVITES -> 400", async () => {
    const emails = Array.from({ length: MAX_INVITES + 1 }, (_, i) => `u${i}@x.com`);

    await expect(
      invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
  });

  it("exactamente MAX_INVITES pasa", async () => {
    const emails = Array.from({ length: MAX_INVITES }, (_, i) => `u${i}@x.com`);

    const res = await invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails });
    expect(res.resultados).toHaveLength(MAX_INVITES);
  });

  it.each(["APROBADO", "PENDIENTE", "RECHAZADO"])(
    "participante existente %s -> YA_PARTICIPA, sin fila ni mail",
    async (estado) => {
      m.participantes.findByEmail.mockResolvedValue({ id: "p-1", estado });

      const res = await invitar(m.deps, {
        salaId: SALA_ID,
        hostUserId: HOST_ID,
        emails: ["a@x.com"],
      });

      expect(res.resultados).toEqual([
        { email: "a@x.com", estado: "YA_PARTICIPA", emailEnviado: false },
      ]);
      expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
      expect(m.invitaciones.rotarToken).not.toHaveBeenCalled();
      expect(m.mailer.send).not.toHaveBeenCalled();
    },
  );

  it("cuenta registrada que ya es participante con otro email -> YA_PARTICIPA", async () => {
    m.usuarios.findByEmailInsensitive.mockResolvedValue({
      id: "u-host",
      nombre: "H",
      apellido: "H",
      email: "host@x.com",
    });
    m.participantes.findByUsuario.mockResolvedValue({ id: "p-host", estado: "APROBADO" });

    const res = await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["host@x.com"],
    });

    expect(res.resultados[0].estado).toBe("YA_PARTICIPA");
    expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
  });

  it("reinvitacion a INVITADO: rota el hash, un solo participante, REENVIADO", async () => {
    m.participantes.findByEmail.mockResolvedValue({ id: "p-inv", estado: "INVITADO" });
    m.invitaciones.rotarToken.mockResolvedValue({});

    const res = await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["a@x.com"],
    });

    expect(m.invitaciones.crearInvitado).not.toHaveBeenCalled();
    expect(m.invitaciones.rotarToken).toHaveBeenCalledTimes(1);
    const data = m.invitaciones.rotarToken.mock.calls[0][0];
    expect(data).toMatchObject({ participanteId: "p-inv", invitadoPorId: HOST_ID });
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.mailer.send).toHaveBeenCalledTimes(1);
    expect(res.resultados[0]).toEqual({
      email: "a@x.com",
      estado: "REENVIADO",
      emailEnviado: true,
    });
  });

  it("si el mail falla, las filas persisten y se reporta emailEnviado=false", async () => {
    m.mailer.send.mockRejectedValueOnce(new Error("smtp caido"));

    const res = await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["a@x.com", "b@x.com"],
    });

    expect(m.invitaciones.crearInvitado).toHaveBeenCalledTimes(2);
    expect(res.resultados.map((r) => [r.estado, r.emailEnviado])).toEqual([
      ["INVITADO", false],
      ["INVITADO", true],
    ]);
  });

  it("el mail se envia despues de persistir todas las filas", async () => {
    const orden: string[] = [];
    m.invitaciones.crearInvitado.mockImplementation(async () => {
      orden.push("db");
      return { id: "p" };
    });
    m.mailer.send.mockImplementation(async () => {
      orden.push("mail");
    });

    await invitar(m.deps, {
      salaId: SALA_ID,
      hostUserId: HOST_ID,
      emails: ["a@x.com", "b@x.com"],
    });

    expect(orden).toEqual(["db", "db", "mail", "mail"]);
  });

  it("el log de fallo de mail no contiene el token", async () => {
    m.mailer.send.mockRejectedValueOnce(new Error("boom"));

    await invitar(m.deps, { salaId: SALA_ID, hostUserId: HOST_ID, emails: ["a@x.com"] });

    const token = /\/invitacion\/([\w-]+)/.exec(m.mailer.send.mock.calls[0][0].text)?.[1];
    expect(token).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(token!);
  });
});

describe("previewInvitacion", () => {
  let m: ReturnType<typeof crearDeps>;
  const futuro = () => new Date(Date.now() + 3600_000);

  function invitacion(over: Record<string, unknown> = {}, partOver: Record<string, unknown> = {}, salaOver: Record<string, unknown> = {}) {
    return {
      id: "i-1",
      usedAt: null,
      expiresAt: futuro(),
      participante: {
        id: "p-1",
        email: "a@x.com",
        usuarioId: null,
        estado: "INVITADO",
        sala: { id: SALA_ID, nombre: "Sala Q4", codigo: "ABCD1234", estado: "ACTIVA", ...salaOver },
        ...partOver,
      },
      ...over,
    };
  }

  beforeEach(() => {
    m = crearDeps();
  });

  it("no registrado -> requiereDatos true, requiereLogin false, y busca por hash", async () => {
    m.invitaciones.findByTokenHash.mockResolvedValue(invitacion());

    const res = await previewInvitacion(m.deps, "tok-en");

    expect(m.invitaciones.findByTokenHash).toHaveBeenCalledWith(hashInvitationToken("tok-en"));
    expect(res).toEqual({
      sala: { id: SALA_ID, nombre: "Sala Q4" },
      email: "a@x.com",
      requiereDatos: true,
      requiereLogin: false,
    });
  });

  it("registrado -> requiereDatos false, requiereLogin true", async () => {
    m.invitaciones.findByTokenHash.mockResolvedValue(
      invitacion({}, { usuarioId: "u-1" }),
    );

    const res = await previewInvitacion(m.deps, "t");
    expect(res.requiereDatos).toBe(false);
    expect(res.requiereLogin).toBe(true);
  });

  it("no consume: dos consultas seguidas siguen ok", async () => {
    m.invitaciones.findByTokenHash.mockResolvedValue(invitacion());
    await previewInvitacion(m.deps, "t");
    await expect(previewInvitacion(m.deps, "t")).resolves.toBeTruthy();
  });

  it.each([
    ["desconocido", null],
    ["expirado", invitacion({ expiresAt: new Date(Date.now() - 1000) })],
    ["usado", invitacion({ usedAt: new Date() })],
    ["participante ya no INVITADO", invitacion({}, { estado: "PENDIENTE" })],
    ["sala cancelada", invitacion({}, {}, { estado: "CANCELADA" })],
    ["sala finalizada", invitacion({}, {}, { estado: "FINALIZADA" })],
  ])("%s -> 410 INVITATION_INVALID uniforme", async (_n, inv) => {
    m.invitaciones.findByTokenHash.mockResolvedValue(inv);

    const err = await previewInvitacion(m.deps, "t").catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 410, code: "INVITATION_INVALID" });
  });
});
