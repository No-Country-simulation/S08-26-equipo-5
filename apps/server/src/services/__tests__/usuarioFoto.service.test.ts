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
    uploadAvatar: vi
      .fn()
      .mockImplementation(async (_b: Buffer, o: { publicId: string }) => ({
        url: "https://cdn/v2/a/" + o.publicId + ".jpg",
        publicId: "a/" + o.publicId,
      })),
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

  it("sube con un publicId opaco (UUID aleatorio, sin el id del usuario) y guarda url+publicId", async () => {
    const { service, storage, users } = setup(user({ id: "usuario-secreto-123" }));
    const out = await service.setFoto("usuario-secreto-123", { buffer: JPEG, size: JPEG.length });

    const [, opts] = storage.uploadAvatar.mock.calls[0];
    expect(opts.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(opts.publicId).not.toContain("usuario-secreto-123");
    expect(out.fotoUrl).toBe("https://cdn/v2/a/" + opts.publicId + ".jpg");
    expect(users.updateFoto).toHaveBeenCalledWith("usuario-secreto-123", {
      fotoUrl: out.fotoUrl,
      fotoPublicId: "a/" + opts.publicId,
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("cada subida usa un publicId distinto", async () => {
    const { service, storage } = setup();
    await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(storage.uploadAvatar.mock.calls[0][1].publicId).not.toBe(storage.uploadAvatar.mock.calls[1][1].publicId);
  });

  it("si falla el update de DB, borra el asset recién subido (sin huérfanos) y propaga el error", async () => {
    const { service, storage, users } = setup(user({ fotoPublicId: "viejo/x" }));
    users.updateFoto.mockRejectedValue(new Error("db down"));
    await expect(service.setFoto("u1", { buffer: JPEG, size: JPEG.length })).rejects.toThrow("db down");
    const nuevo = "a/" + storage.uploadAvatar.mock.calls[0][1].publicId;
    expect(storage.delete).toHaveBeenCalledWith(nuevo);
    expect(storage.delete).not.toHaveBeenCalledWith("viejo/x");
  });

  it("el borrado del asset nuevo tras fallo de DB también es best-effort", async () => {
    const { service, storage, users } = setup();
    users.updateFoto.mockRejectedValue(new Error("db down"));
    storage.delete.mockRejectedValue(new Error("cloud down"));
    await expect(service.setFoto("u1", { buffer: JPEG, size: JPEG.length })).rejects.toThrow("db down");
  });

  it("502 UPLOAD_FAILED si Cloudinary falla, sin tocar la DB; loguea solo el mensaje", async () => {
    const { service, storage, users } = setup();
    storage.uploadAvatar.mockRejectedValue(
      Object.assign(new Error("Invalid api_key 123456"), { http_code: 401, name: "CloudinaryError" }),
    );
    expect(await codeOf(service.setFoto("u1", { buffer: JPEG, size: JPEG.length }))).toEqual({
      status: 502,
      code: "UPLOAD_FAILED",
    });
    expect(users.updateFoto).not.toHaveBeenCalled();
    const logged = JSON.stringify((console.error as any).mock.calls);
    // solo línea genérica + http_code/name: nunca el mensaje crudo (puede traer la api_key)
    expect(logged).toContain("401");
    expect(logged).toContain("CloudinaryError");
    expect(logged).not.toContain("123456");
  });

  it("borra best-effort el publicId anterior si es distinto", async () => {
    const { service, storage } = setup(user({ fotoUrl: "old", fotoPublicId: "viejo/u1" }));
    storage.delete.mockRejectedValue(new Error("nope"));
    const out = await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(out.fotoUrl).toContain("https://cdn/v2/a/");
    expect(storage.delete).toHaveBeenCalledWith("viejo/u1");
  });

  it("borra el anterior DESPUÉS de persistir el nuevo", async () => {
    const { service, storage, users } = setup(user({ fotoUrl: "old", fotoPublicId: "a/anterior" }));
    const orden: string[] = [];
    users.updateFoto.mockImplementation(async () => void orden.push("db"));
    storage.delete.mockImplementation(async () => void orden.push("delete"));
    await service.setFoto("u1", { buffer: JPEG, size: JPEG.length });
    expect(orden).toEqual(["db", "delete"]);
    expect(storage.delete).toHaveBeenCalledWith("a/anterior");
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
    storage.delete.mockRejectedValue(Object.assign(new Error("secret api_key 999"), { http_code: 503 }));
    await service.removeFoto("u1");
    expect(JSON.stringify((console.warn as any).mock.calls)).not.toContain("999");
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
