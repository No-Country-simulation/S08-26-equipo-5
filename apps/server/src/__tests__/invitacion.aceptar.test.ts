import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    nodeEnv: "test",
    jwtSecret: "test-jwt-secret",
    participantTokenTtlSeconds: 7200,
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
  aceptarInvitacion,
  type InvitacionDeps,
} from "../services/invitacion.service.js";
import { hashInvitationToken } from "../utils/invitationToken.js";
import { verifyParticipantToken } from "../utils/participantToken.js";
import { setReunionesNamespace } from "../realtime/registry.js";

const SALA_ID = "sala-1";

function crearDeps() {
  const invitaciones = {
    findByTokenHash: vi.fn(),
    consumirYActivar: vi.fn(),
  };
  const usuarios = { findById: vi.fn() };
  const participantes = { findByUsuario: vi.fn() };
  const deps = { invitaciones, usuarios, participantes } as unknown as InvitacionDeps;
  return { deps, invitaciones, usuarios, participantes };
}

function invitacion(
  over: Record<string, unknown> = {},
  partOver: Record<string, unknown> = {},
  salaOver: Record<string, unknown> = {},
) {
  return {
    id: "i-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 3600_000),
    participante: {
      id: "p-1",
      salaId: SALA_ID,
      email: "a@x.com",
      usuarioId: null,
      nombre: null,
      apellido: null,
      rol: "PARTICIPANTE",
      estado: "INVITADO",
      sala: { id: SALA_ID, nombre: "Sala Q4", codigo: "ABCD1234", estado: "ACTIVA", ...salaOver },
      ...partOver,
    },
    ...over,
  };
}

describe("aceptarInvitacion", () => {
  let m: ReturnType<typeof crearDeps>;
  const emit = vi.fn();
  const to = vi.fn();

  beforeEach(() => {
    emit.mockReset();
    to.mockReset().mockReturnValue({ emit });
    setReunionesNamespace({ to } as never);
    m = crearDeps();
    m.invitaciones.findByTokenHash.mockResolvedValue(invitacion());
    m.invitaciones.consumirYActivar.mockResolvedValue({
      invitacionConsumida: true,
      participanteActivado: true,
    });
  });

  it("no registrado: guarda nombre/apellido (trim), pasa a PENDIENTE, emite join:pending y devuelve guest JWT", async () => {
    const res = await aceptarInvitacion(m.deps, {
      token: "tok-en",
      nombre: "  Ana ",
      apellido: " Pérez",
    });

    expect(m.invitaciones.findByTokenHash).toHaveBeenCalledWith(hashInvitationToken("tok-en"));
    expect(m.invitaciones.consumirYActivar).toHaveBeenCalledWith({
      invitacionId: "i-1",
      participanteId: "p-1",
      nombre: "Ana",
      apellido: "Pérez",
    });
    expect(res).toMatchObject({
      participanteId: "p-1",
      estado: "PENDIENTE",
      salaId: SALA_ID,
      salaCodigo: "ABCD1234",
    });
    expect(verifyParticipantToken(res.accessToken)).toMatchObject({
      sub: "p-1",
      salaId: SALA_ID,
      rol: "PARTICIPANTE",
    });
    expect(to).toHaveBeenCalledWith(`sala:${SALA_ID}:host`);
    expect(emit).toHaveBeenCalledWith(
      "join:pending",
      expect.objectContaining({
        participanteId: "p-1",
        nombre: "Ana",
        apellido: "Pérez",
        email: "a@x.com",
      }),
    );
  });

  it.each([
    [undefined, "Pérez"],
    ["Ana", undefined],
    ["   ", "Pérez"],
    ["Ana", ""],
    [123, "Pérez"],
  ])("no registrado sin nombre/apellido validos (%j, %j) -> 400 y NO consume el token", async (nombre, apellido) => {
    await expect(
      aceptarInvitacion(m.deps, { token: "t", nombre, apellido }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  describe("invitado registrado", () => {
    beforeEach(() => {
      m.invitaciones.findByTokenHash.mockResolvedValue(
        invitacion({}, { usuarioId: "u-1", nombre: "Ana", apellido: "Paz" }),
      );
    });

    it("sin sesion -> 401 LOGIN_REQUIRED sin consumir", async () => {
      await expect(aceptarInvitacion(m.deps, { token: "t" })).rejects.toMatchObject({
        statusCode: 401,
        code: "LOGIN_REQUIRED",
      });
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
    });

    it("sesion de otra cuenta -> 403 INVITATION_ACCOUNT_MISMATCH sin consumir", async () => {
      await expect(
        aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-2" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "INVITATION_ACCOUNT_MISMATCH" });
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
    });

    it("join:pending incluye la fotoUrl de la cuenta invitada; si la consulta falla, igual emite con null", async () => {
      (m.usuarios as Record<string, unknown>).findFotoUrl = vi
        .fn()
        .mockResolvedValue("https://cdn/v1/ana.jpg");
      await aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-1" });
      expect(emit).toHaveBeenCalledWith(
        "join:pending",
        expect.objectContaining({ fotoUrl: "https://cdn/v1/ana.jpg" }),
      );

      emit.mockClear();
      m.invitaciones.findByTokenHash.mockResolvedValue(
        invitacion({}, { usuarioId: "u-1", nombre: "Ana", apellido: "Paz" }),
      );
      (m.usuarios as Record<string, unknown>).findFotoUrl = vi.fn().mockRejectedValue(new Error("db"));
      await aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-1" });
      expect(emit).toHaveBeenCalledWith("join:pending", expect.objectContaining({ fotoUrl: null }));
    });

    it("sesion correcta sin body -> OK; el nombre/apellido del body se ignora", async () => {
      const res = await aceptarInvitacion(m.deps, {
        token: "t",
        usuarioId: "u-1",
        nombre: "Impostor",
        apellido: "Falso",
      });

      expect(res.estado).toBe("PENDIENTE");
      expect(m.invitaciones.consumirYActivar).toHaveBeenCalledWith({
        invitacionId: "i-1",
        participanteId: "p-1",
      });
      expect(emit).toHaveBeenCalledWith(
        "join:pending",
        expect.objectContaining({ nombre: "Ana", apellido: "Paz" }),
      );
    });
  });

  describe("invitado sin cuenta que acepta con sesion (vinculacion por email)", () => {
    const cuenta = (over: Record<string, unknown> = {}) => ({
      id: "u-9",
      email: "A@X.com",
      nombre: "Ana",
      apellido: "Paz",
      ...over,
    });

    beforeEach(() => {
      m.usuarios.findById.mockResolvedValue(cuenta());
      m.participantes.findByUsuario.mockResolvedValue(null);
    });

    it("email de la cuenta == email invitado (case-insensitive) -> vincula usuarioId y completa nombre/apellido desde la cuenta", async () => {
      const res = await aceptarInvitacion(m.deps, {
        token: "t",
        usuarioId: "u-9",
        nombre: "Impostor",
        apellido: "Falso",
      });

      expect(m.usuarios.findById).toHaveBeenCalledWith("u-9");
      expect(m.invitaciones.consumirYActivar).toHaveBeenCalledWith({
        invitacionId: "i-1",
        participanteId: "p-1",
        usuarioId: "u-9",
        nombre: "Ana",
        apellido: "Paz",
      });
      expect(res.estado).toBe("PENDIENTE");
      expect(emit).toHaveBeenCalledWith(
        "join:pending",
        expect.objectContaining({ nombre: "Ana", apellido: "Paz", email: "a@x.com" }),
      );
    });

    it("email distinto -> 403 INVITATION_ACCOUNT_MISMATCH y NO consume el token", async () => {
      m.usuarios.findById.mockResolvedValue(cuenta({ email: "otra@x.com" }));

      await expect(
        aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-9" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "INVITATION_ACCOUNT_MISMATCH" });
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it("la cuenta del JWT ya no existe -> 403 INVITATION_ACCOUNT_MISMATCH sin consumir", async () => {
      m.usuarios.findById.mockResolvedValue(null);

      await expect(
        aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-9" }),
      ).rejects.toMatchObject({ statusCode: 403, code: "INVITATION_ACCOUNT_MISMATCH" });
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
    });

    it("la cuenta ya es otro participante de la sala -> 409 ALREADY_PARTICIPANT sin consumir", async () => {
      m.participantes.findByUsuario.mockResolvedValue({ id: "p-otro" });

      await expect(
        aceptarInvitacion(m.deps, { token: "t", usuarioId: "u-9" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_PARTICIPANT" });
      expect(m.participantes.findByUsuario).toHaveBeenCalledWith(SALA_ID, "u-9");
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
    });
  });

  describe("token invalido -> 410 INVITATION_INVALID (una sola respuesta, sin oraculo)", () => {
    const casos: Array<[string, () => unknown]> = [
      ["desconocido", () => null],
      ["usado", () => invitacion({ usedAt: new Date() })],
      ["vencido", () => invitacion({ expiresAt: new Date(Date.now() - 1000) })],
      ["participante ya no INVITADO", () => invitacion({}, { estado: "PENDIENTE" })],
      ["sala cancelada", () => invitacion({}, {}, { estado: "CANCELADA" })],
      ["sala finalizada", () => invitacion({}, {}, { estado: "FINALIZADA" })],
    ];

    it.each(casos)("%s", async (_nombre, fabricar) => {
      m.invitaciones.findByTokenHash.mockResolvedValue(fabricar());

      await expect(
        aceptarInvitacion(m.deps, { token: "t", nombre: "Ana", apellido: "Pérez" }),
      ).rejects.toMatchObject({ statusCode: 410, code: "INVITATION_INVALID" });
      expect(m.invitaciones.consumirYActivar).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it("el token invalido gana sobre la validacion de datos y sobre el login (misma respuesta)", async () => {
      m.invitaciones.findByTokenHash.mockResolvedValue(null);
      await expect(aceptarInvitacion(m.deps, { token: "t" })).rejects.toMatchObject({
        statusCode: 410,
      });
    });
  });

  it("perdio la carrera en la transaccion (invitacion no consumida) -> 410 sin emitir", async () => {
    m.invitaciones.consumirYActivar.mockResolvedValue({
      invitacionConsumida: false,
      participanteActivado: false,
    });

    await expect(
      aceptarInvitacion(m.deps, { token: "t", nombre: "Ana", apellido: "Pérez" }),
    ).rejects.toMatchObject({ statusCode: 410, code: "INVITATION_INVALID" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("invitacion consumida pero el participante ya no era INVITADO -> 410 sin emitir", async () => {
    m.invitaciones.consumirYActivar.mockResolvedValue({
      invitacionConsumida: true,
      participanteActivado: false,
    });

    await expect(
      aceptarInvitacion(m.deps, { token: "t", nombre: "Ana", apellido: "Pérez" }),
    ).rejects.toMatchObject({ statusCode: 410, code: "INVITATION_INVALID" });
    expect(emit).not.toHaveBeenCalled();
  });

  it("dos aceptaciones concurrentes: una 200 y otra 410", async () => {
    m.invitaciones.consumirYActivar
      .mockResolvedValueOnce({ invitacionConsumida: true, participanteActivado: true })
      .mockResolvedValueOnce({ invitacionConsumida: false, participanteActivado: false });

    const resultados = await Promise.allSettled([
      aceptarInvitacion(m.deps, { token: "t", nombre: "Ana", apellido: "Pérez" }),
      aceptarInvitacion(m.deps, { token: "t", nombre: "Ana", apellido: "Pérez" }),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rechazo.reason).toMatchObject({ statusCode: 410, code: "INVITATION_INVALID" });
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
