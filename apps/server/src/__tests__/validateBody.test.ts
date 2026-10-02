import { describe, expect, it, vi } from "vitest";
import { validateBody } from "../middlewares/validateBody.js";

function correr(rules: Parameters<typeof validateBody>[0], body: unknown) {
  const next = vi.fn();
  validateBody(rules)({ body } as any, {} as any, next);
  return next.mock.calls[0][0] as { code: string; details: { campo: string; mensaje: string }[] } | undefined;
}

describe("validateBody — topes de tamaño", () => {
  it("maxLength: acepta el borde y rechaza uno más", () => {
    const rules = [{ field: "email", required: true, email: true, maxLength: 254 }];
    const ok = `${"a".repeat(242)}@example.com`; // 254
    expect(ok).toHaveLength(254);

    expect(correr(rules, { email: ok })).toBeUndefined();
    const err = correr(rules, { email: `a${ok}` });
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.details[0]).toEqual({
      campo: "email",
      mensaje: "No puede superar 254 caracteres",
    });
  });

  it("maxBytes cuenta bytes UTF-8, no caracteres", () => {
    const rules = [
      { field: "password", required: true, maxBytes: 72, maxBytesMessage: "La contraseña no puede superar 72 bytes" },
    ];

    expect(correr(rules, { password: "a".repeat(72) })).toBeUndefined();
    expect(correr(rules, { password: "ñ".repeat(36) })).toBeUndefined(); // 72 bytes
    const err = correr(rules, { password: "ñ".repeat(37) }); // 37 chars, 74 bytes
    expect(err?.details[0].mensaje).toBe("La contraseña no puede superar 72 bytes");
  });

  it("sin tope configurado no cambia el comportamiento previo", () => {
    expect(correr([{ field: "password", required: true }], { password: "x".repeat(500) })).toBeUndefined();
  });
});
