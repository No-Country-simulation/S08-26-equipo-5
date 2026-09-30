import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUploadStream, mockDestroy, mockConfig } = vi.hoisted(() => ({
  mockUploadStream: vi.fn(),
  mockDestroy: vi.fn(),
  mockConfig: vi.fn(),
}));

vi.mock("cloudinary", () => ({
  v2: {
    config: (...a: unknown[]) => mockConfig(...a),
    uploader: {
      upload_stream: (...a: unknown[]) => mockUploadStream(...a),
      destroy: (...a: unknown[]) => mockDestroy(...a),
    },
  },
}));

import { CloudinaryStorage, createImageStorage } from "../cloudinary.storage.js";

const URL_OK = "cloudinary://123456:s3cr3t@mi-cloud";

/** upload_stream(options, cb) devuelve un writable cuyo end(buffer) dispara cb. */
function stubUpload(result: unknown, error: unknown = undefined) {
  mockUploadStream.mockImplementation((_opts: unknown, cb: (e: unknown, r: unknown) => void) => ({
    end: (_buf: Buffer) => cb(error, result),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createImageStorage", () => {
  it("devuelve null si no hay CLOUDINARY_URL", () => {
    expect(createImageStorage({ cloudinaryUrl: undefined, folder: "f" })).toBeNull();
    expect(createImageStorage({ cloudinaryUrl: "", folder: "f" })).toBeNull();
  });

  it("configura el SDK parseando la URL (sin depender de process.env)", () => {
    const storage = createImageStorage({ cloudinaryUrl: URL_OK, folder: "f" });
    expect(storage).toBeInstanceOf(CloudinaryStorage);
    expect(mockConfig).toHaveBeenCalledWith(
      expect.objectContaining({ cloud_name: "mi-cloud", api_key: "123456", api_secret: "s3cr3t", secure: true }),
    );
  });

  it("falla con un mensaje que no incluye el secret si la URL es inválida", () => {
    expect(() => createImageStorage({ cloudinaryUrl: "http://nada:secretito@x", folder: "f" })).toThrow(
      /CLOUDINARY_URL/,
    );
    try {
      createImageStorage({ cloudinaryUrl: "http://nada:secretito@x", folder: "f" });
    } catch (e) {
      expect((e as Error).message).not.toContain("secretito");
    }
  });
});

describe("CloudinaryStorage.uploadAvatar", () => {
  it("sube con public_id determinístico, overwrite, invalidate y transformación 256x256 face", async () => {
    stubUpload({ secure_url: "https://res.cloudinary.com/mi-cloud/image/upload/v99/meetflow/avatars/u1.jpg", public_id: "meetflow/avatars/u1" });
    const storage = new CloudinaryStorage("meetflow/avatars");

    const out = await storage.uploadAvatar(Buffer.from("x"), { publicId: "u1" });

    expect(out).toEqual({
      url: "https://res.cloudinary.com/mi-cloud/image/upload/v99/meetflow/avatars/u1.jpg",
      publicId: "meetflow/avatars/u1",
    });
    expect(mockUploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        public_id: "meetflow/avatars/u1",
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        transformation: [
          { width: 256, height: 256, crop: "fill", gravity: "face" },
          { quality: "auto", fetch_format: "auto" },
        ],
      }),
      expect.any(Function),
    );
  });

  it("rechaza si Cloudinary devuelve error", async () => {
    stubUpload(undefined, { message: "Invalid credentials" });
    const storage = new CloudinaryStorage("f");
    await expect(storage.uploadAvatar(Buffer.from("x"), { publicId: "u1" })).rejects.toThrow("Invalid credentials");
  });

  it("rechaza si la respuesta no trae secure_url", async () => {
    stubUpload({});
    const storage = new CloudinaryStorage("f");
    await expect(storage.uploadAvatar(Buffer.from("x"), { publicId: "u1" })).rejects.toThrow();
  });
});

describe("CloudinaryStorage.delete", () => {
  it("destruye el asset invalidando el CDN", async () => {
    mockDestroy.mockResolvedValue({ result: "ok" });
    await new CloudinaryStorage("f").delete("f/u1");
    expect(mockDestroy).toHaveBeenCalledWith("f/u1", { resource_type: "image", invalidate: true });
  });

  it("propaga el error del SDK", async () => {
    mockDestroy.mockRejectedValue(new Error("boom"));
    await expect(new CloudinaryStorage("f").delete("f/u1")).rejects.toThrow("boom");
  });
});
