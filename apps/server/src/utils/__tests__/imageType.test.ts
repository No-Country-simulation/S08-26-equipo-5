import { describe, it, expect } from "vitest";
import { detectImageType } from "../imageType.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 ", "ascii"),
]);

describe("detectImageType", () => {
  it("reconoce JPEG por magic bytes", () => {
    expect(detectImageType(jpeg)).toBe("jpeg");
  });

  it("reconoce PNG por magic bytes", () => {
    expect(detectImageType(png)).toBe("png");
  });

  it("reconoce WebP (RIFF....WEBP)", () => {
    expect(detectImageType(webp)).toBe("webp");
  });

  it("rechaza RIFF que no es WebP (ej. WAV)", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0, 0, 0]),
      Buffer.from("WAVEfmt ", "ascii"),
    ]);
    expect(detectImageType(wav)).toBeNull();
  });

  it("rechaza GIF, SVG, PDF y texto", () => {
    expect(detectImageType(Buffer.from("GIF89a......"))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns='x'></svg>"))).toBeNull();
    expect(detectImageType(Buffer.from("%PDF-1.7 xxxxxxxx"))).toBeNull();
    expect(detectImageType(Buffer.from("hola mundo"))).toBeNull();
  });

  it("rechaza buffers vacíos o demasiado cortos", () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
