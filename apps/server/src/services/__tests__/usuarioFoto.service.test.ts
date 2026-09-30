import { describe, it, expect, vi, beforeEach } from "vitest";
import { UsuarioFotoService } from "../usuarioFoto.service.js";
import { AppError } from "../../utils/AppError.js";
import type { IUserRepository } from "../../repositories/user.repository.js";
import type { ImageStorage } from "../../storage/image-storage.port.js";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const MAX = 1024;

function user(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    nombre: "Ana",
    apellido: "P",
    email: "a@t.com",
    passwordHash: "h",
    fotoUrl: null,
    fotoPublicId: null,
    ...over,
  };
}

function setup(u: ReturnType<typeof user> | null = user(), withStorage = true) {
  const users = {
    findById: vi.fn().mockResolvedValue(u),
    updateFoto: vi.fn().mockImplementation(async (_id, foto) => ({ ...u, ...foto })),
  };
  const storage = {
    uploadAvatar: vi.fn().mockResolvedValue({ url: "https://cdn/v2/a/u1.jpg", publicId: "a/u1" }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const service = new UsuarioFotoService(
    users as unknown as IUserRepository,
    withStorage ? (storage as ImageStorage) : null,
    { maxBytes: MAX },
  );
  return { users, storage, service };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    const err = e as AppError;
    return { status: err.statusCode, code: err.code };
  }
  throw new Error("no lanzó");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("UsuarioFotoService.setFoto", () => {
  it("503 UPLOADS_NOT_CONFIGURED sin storage", async () => {
    const { service } = setup(user(), false);
    expect(await codeOf(service.setFoto("u1", { buffer: JPEG, size: JPEG.length }))).toEqual({
      status: 503,
      code: "UPLOADS_NOT_CONFIGURED",
    });
  });

  it("400 VALIDATION_ERROR sin archivo", async () => {
    const { service } = setup();
    expect(await codeOf(service.setFoto("u1", undefined))).toEqual({ status: 400, code: "VALIDATION_ERROR" });
  });

  it("400 si el archivo está vacío", async () => {
    const { service } = setup();
    expect(await codeOf(service.setFoto("u1", { buffer: Buffer.alloc(0), size: 0 }))).toEqual({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("413 FILE_TOO_LARGE si supera el máximo", async () => {
    const { service, storage } = setup();
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX)]);
    expect(await codeOf(service.setFoto("u1", { buffer: big, size: big.length }))).toEqual({
      status: 413,
      code: "FILE_TOO_LARGE",
    });
    expect(storage.uploadAvatar).not.toHaveBeenCalled();
  });

  it("415 UNSUPPORTED_MEDIA_TYPE si los magic bytes no son JPEG/PNG/WebP", async () => {
    const { service, storage } = setup();
    const fake = Buffer.from("<svg onload=alert(1)></svg>");
    expect(await codeOf(service.setFoto("u1", { buffer: fake, size: fake.length }))).toEqual({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    expect(storage.uploadAvatar).not.toHaveBeenCalled();
  });

  it("404 si el usuario no existe", async () => {
    const { service } = setup(null);
    expect(await codeOf(service.setFoto("u1", { buffer: JPEG, size: JPEG.length }))).toEqual({
      status: 404,
      code: "USER_NOT_FOUND",
    });
  });

  it("sube con el id del usuario, guarda url+publicId y devuelve fotoUrl", async () => {
    const { service, storage, users } = setup();
    const out = await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(out).toEqual({ fotoUrl: "https://cdn/v2/a/u1.jpg" });
    expect(storage.uploadAvatar).toHaveBeenCalledWith(JPEG, { publicId: "u1" });
    expect(users.updateFoto).toHaveBeenCalledWith("u1", {
      fotoUrl: "https://cdn/v2/a/u1.jpg",
      fotoPublicId: "a/u1",
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("502 UPLOAD_FAILED si Cloudinary falla, sin tocar la DB; loguea solo el mensaje", async () => {
    const { service, storage, users } = setup();
    storage.uploadAvatar.mockRejectedValue(new Error("timeout"));
    expect(await codeOf(service.setFoto("u1", { buffer: JPEG, size: JPEG.length }))).toEqual({
      status: 502,
      code: "UPLOAD_FAILED",
    });
    expect(users.updateFoto).not.toHaveBeenCalled();
    expect(JSON.stringify((console.error as any).mock.calls)).toContain("timeout");
  });

  it("borra best-effort el publicId anterior si es distinto", async () => {
    const { service, storage } = setup(user({ fotoUrl: "old", fotoPublicId: "viejo/u1" }));
    storage.delete.mockRejectedValue(new Error("nope"));
    const out = await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(out.fotoUrl).toBe("https://cdn/v2/a/u1.jpg");
    expect(storage.delete).toHaveBeenCalledWith("viejo/u1");
  });

  it("no borra si el publicId anterior es el mismo (overwrite)", async () => {
    const { service, storage } = setup(user({ fotoUrl: "old", fotoPublicId: "a/u1" }));
    await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(storage.delete).not.toHaveBeenCalled();
  });
});

describe("UsuarioFotoService.removeFoto", () => {
  it("sin storage igual limpia la DB, omite el borrado remoto y avisa con un warning", async () => {
    const { service, users } = setup(user({ fotoUrl: "x", fotoPublicId: "a/u1" }), false);
    await service.removeFoto("u1");
    expect(users.updateFoto).toHaveBeenCalledWith("u1", { fotoUrl: null, fotoPublicId: null });
    expect(console.warn).toHaveBeenCalled();
  });

  it("borra en Cloudinary y limpia ambos campos", async () => {
    const { service, storage, users } = setup(user({ fotoUrl: "x", fotoPublicId: "a/u1" }));
    await service.removeFoto("u1");
    expect(storage.delete).toHaveBeenCalledWith("a/u1");
    expect(users.updateFoto).toHaveBeenCalledWith("u1", { fotoUrl: null, fotoPublicId: null });
  });

  it("si Cloudinary falla, igual limpia la DB", async () => {
    const { service, storage, users } = setup(user({ fotoUrl: "x", fotoPublicId: "a/u1" }));
    storage.delete.mockRejectedValue(new Error("down"));
    await service.removeFoto("u1");
    expect(users.updateFoto).toHaveBeenCalledWith("u1", { fotoUrl: null, fotoPublicId: null });
    expect(console.warn).toHaveBeenCalled();
  });

  it("es idempotente si no hay foto", async () => {
    const { service, storage, users } = setup();
    await service.removeFoto("u1");
    expect(storage.delete).not.toHaveBeenCalled();
    expect(users.updateFoto).not.toHaveBeenCalled();
  });

  it("404 si el usuario no existe", async () => {
    const { service } = setup(null);
    expect(await codeOf(service.removeFoto("u1"))).toEqual({ status: 404, code: "USER_NOT_FOUND" });
  });
});
