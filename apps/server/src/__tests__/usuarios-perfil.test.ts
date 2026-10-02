import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { jwtSecret: "test-jwt-secret" },
}));

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createUsuariosRouter } from "../routes/usuarios.routes.js";
import { UsuarioFotoService } from "../services/usuarioFoto.service.js";
import { UsuarioPerfilService } from "../services/usuarioPerfil.service.js";
import { errorMiddleware } from "../middlewares/error.middleware.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { User } from "../models/user.model.js";

const token = jwt.sign({ sub: "u1", email: "a@t.com" }, "test-jwt-secret");
const auth = { Authorization: `Bearer ${token}` };

function user(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    nombre: "Ana",
    apellido: "Pérez",
    email: "a@t.com",
    passwordHash: "hash",
    fotoUrl: null,
    fotoPublicId: null,
    ...overrides,
  };
}

function build(saved: User | null = user()) {
  const updateDatos = vi.fn().mockResolvedValue(saved);
  const perfil = new UsuarioPerfilService({ updateDatos });
  const foto = new UsuarioFotoService({} as IUserRepository, null, { maxBytes: 256 });
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1",
    createUsuariosRouter({ service: foto, perfil, maxBytes: 256, rateLimitMax: 100 }),
  );
  app.use(errorMiddleware);
  return { app, updateDatos };
}

describe("PATCH /usuarios/me", () => {
  it("401 sin token", async () => {
    const { app } = build();
    const res = await request(app).patch("/api/v1/usuarios/me").send({ nombre: "Ana", apellido: "Pérez" });
    expect(res.status).toBe(401);
  });

  it("guarda el nombre y el apellido recortados", async () => {
    const { app, updateDatos } = build(user({ nombre: "Ana", apellido: "Pérez" }));
    const res = await request(app)
      .patch("/api/v1/usuarios/me")
      .set(auth)
      .send({ nombre: "  Ana  ", apellido: " Pérez " });
    expect(res.status).toBe(200);
    expect(updateDatos).toHaveBeenCalledWith("u1", { nombre: "Ana", apellido: "Pérez" });
    expect(res.body).toMatchObject({ id: "u1", nombre: "Ana", apellido: "Pérez", email: "a@t.com", fotoUrl: null });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("400 si el nombre queda vacío", async () => {
    const { app, updateDatos } = build();
    const res = await request(app)
      .patch("/api/v1/usuarios/me")
      .set(auth)
      .send({ nombre: "   ", apellido: "Pérez" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(updateDatos).not.toHaveBeenCalled();
  });

  it("400 si supera 100 caracteres", async () => {
    const { app } = build();
    const res = await request(app)
      .patch("/api/v1/usuarios/me")
      .set(auth)
      .send({ nombre: "a".repeat(101), apellido: "Pérez" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("100");
  });

  it("404 si el usuario del token no existe", async () => {
    const { app } = build(null);
    const res = await request(app)
      .patch("/api/v1/usuarios/me")
      .set(auth)
      .send({ nombre: "Ana", apellido: "Pérez" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("USER_NOT_FOUND");
  });
});
