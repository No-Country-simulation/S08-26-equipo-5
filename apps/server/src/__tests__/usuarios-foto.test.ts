import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { jwtSecret: "test-jwt-secret" },
}));

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createUsuariosRouter } from "../routes/usuarios.routes.js";
import { UsuarioFotoService } from "../services/usuarioFoto.service.js";
import { errorMiddleware } from "../middlewares/error.middleware.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { ImageStorage } from "../storage/image-storage.port.js";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const MAX = 256;
const MULTIPART_TRUNCADO = [
  "--XYZ",
  'Content-Disposition: form-data; name="foto"; filename="a.jpg"',
  "Content-Type: image/jpeg",
  "",
  "abc",
].join("\r\n");
const token = jwt.sign({ sub: "u1", email: "a@t.com" }, "test-jwt-secret");
const auth = { Authorization: `Bearer ${token}` };

function build(opts: { storage?: ImageStorage | null; rateLimit?: number; stored?: Record<string, unknown> } = {}) {
  const stored = { id: "u1", fotoUrl: null, fotoPublicId: null, ...(opts.stored ?? {}) };
  const users = {
    findById: vi.fn().mockResolvedValue(stored),
    updateFoto: vi.fn().mockResolvedValue(stored),
    updateFotoIfUnchanged: vi.fn().mockResolvedValue(true),
  };
  const storage =
    opts.storage === undefined
      ? {
          uploadAvatar: vi.fn().mockResolvedValue({ url: "https://cdn/v3/a/u1.jpg", publicId: "a/u1" }),
          delete: vi.fn().mockResolvedValue(undefined),
        }
      : opts.storage;
  const service = new UsuarioFotoService(users as unknown as IUserRepository, storage as ImageStorage | null, {
    maxBytes: MAX,
  });
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createUsuariosRouter({ service, maxBytes: MAX, rateLimitMax: opts.rateLimit ?? 100 }));
  app.use(errorMiddleware);
  return { app, users, storage: storage as { uploadAvatar: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> } };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("PUT /usuarios/me/foto", () => {
  it("401 sin token", async () => {
    const { app } = build();
    const res = await request(app).put("/api/v1/usuarios/me/foto").attach("foto", JPEG, "a.jpg");
    expect(res.status).toBe(401);
  });

  it("503 UPLOADS_NOT_CONFIGURED sin storage", async () => {
    const { app } = build({ storage: null });
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", JPEG, "a.jpg");
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPLOADS_NOT_CONFIGURED");
  });

  it("400 si no se adjunta imagen", async () => {
    const { app } = build();
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("Se requiere una imagen");
  });

  it("400 si el campo multipart no se llama foto", async () => {
    const { app } = build();
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("avatar", JPEG, "a.jpg");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("413 FILE_TOO_LARGE cuando multer corta por tamaño", async () => {
    const { app, storage } = build();
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX * 4)]);
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", big, "a.jpg");
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    expect(storage.uploadAvatar).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_ERROR con multipart truncado (Unexpected end of form)", async () => {
    const { app } = build();
    const res = await request(app)
      .put("/api/v1/usuarios/me/foto")
      .set(auth)
      .set("Content-Type", "multipart/form-data; boundary=XYZ")
      .send(MULTIPART_TRUNCADO);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("400 VALIDATION_ERROR con multipart sin boundary", async () => {
    const { app } = build();
    const res = await request(app)
      .put("/api/v1/usuarios/me/foto")
      .set(auth)
      .set("Content-Type", "multipart/form-data")
      .send("basura");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("415 si el archivo dice ser image/jpeg pero no lo es", async () => {
    const { app } = build();
    const res = await request(app)
      .put("/api/v1/usuarios/me/foto")
      .set(auth)
      .attach("foto", Buffer.from("<html>no soy imagen</html>"), { filename: "a.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("200 con fotoUrl cuando todo sale bien", async () => {
    const { app, users } = build();
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", JPEG, "a.jpg");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fotoUrl: "https://cdn/v3/a/u1.jpg" });
    expect(users.updateFotoIfUnchanged).toHaveBeenCalledWith("u1", null, {
      fotoUrl: "https://cdn/v3/a/u1.jpg",
      fotoPublicId: "a/u1",
    });
  });

  it("409 PHOTO_UPDATE_CONFLICT si la foto cambió en paralelo", async () => {
    const { app, users, storage } = build({ stored: { fotoPublicId: "viejo/x" } });
    users.updateFotoIfUnchanged.mockResolvedValue(false);
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", JPEG, "a.jpg");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PHOTO_UPDATE_CONFLICT");
    expect(storage.delete).toHaveBeenCalledWith("a/u1");
    expect(storage.delete).not.toHaveBeenCalledWith("viejo/x");
  });

  it("502 UPLOAD_FAILED si el proveedor falla", async () => {
    const { app } = build({
      storage: { uploadAvatar: vi.fn().mockRejectedValue(new Error("timeout")), delete: vi.fn() },
    });
    const res = await request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", JPEG, "a.jpg");
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("UPLOAD_FAILED");
  });

  it("429 al superar el rate limit", async () => {
    const { app } = build({ rateLimit: 2 });
    const hit = () => request(app).put("/api/v1/usuarios/me/foto").set(auth).attach("foto", JPEG, "a.jpg");
    expect((await hit()).status).toBe(200);
    expect((await hit()).status).toBe(200);
    const limited = await hit();
    expect(limited.status).toBe(429);
    // mismo formato de error que el resto de la API (AppError -> errorMiddleware)
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("el límite es por usuario, no por IP compartida", async () => {
    const { app } = build({ rateLimit: 1 });
    const otro = { Authorization: `Bearer ${jwt.sign({ sub: "u2", email: "b@t.com" }, "test-jwt-secret")}` };
    const hit = (h: Record<string, string>) =>
      request(app).put("/api/v1/usuarios/me/foto").set(h).attach("foto", JPEG, "a.jpg");
    expect((await hit(auth)).status).toBe(200);
    expect((await hit(auth)).status).toBe(429);
    expect((await hit(otro)).status).toBe(200);
  });
});

describe("DELETE /usuarios/me/foto", () => {
  it("401 sin token", async () => {
    const { app } = build();
    expect((await request(app).delete("/api/v1/usuarios/me/foto")).status).toBe(401);
  });

  it("204 sin Cloudinary configurado: limpia la DB (solo PUT responde 503)", async () => {
    const { app, users } = build({ storage: null, stored: { fotoUrl: "x", fotoPublicId: "a/u1" } });
    const res = await request(app).delete("/api/v1/usuarios/me/foto").set(auth);
    expect(res.status).toBe(204);
    expect(users.updateFoto).toHaveBeenCalledWith("u1", { fotoUrl: null, fotoPublicId: null });
  });

  it("204 y limpia los campos", async () => {
    const { app, users, storage } = build({ stored: { fotoUrl: "x", fotoPublicId: "a/u1" } });
    const res = await request(app).delete("/api/v1/usuarios/me/foto").set(auth);
    expect(res.status).toBe(204);
    expect(storage.delete).toHaveBeenCalledWith("a/u1");
    expect(users.updateFoto).toHaveBeenCalledWith("u1", { fotoUrl: null, fotoPublicId: null });
  });

  it("204 idempotente sin foto", async () => {
    const { app } = build();
    expect((await request(app).delete("/api/v1/usuarios/me/foto").set(auth)).status).toBe(204);
  });
});
