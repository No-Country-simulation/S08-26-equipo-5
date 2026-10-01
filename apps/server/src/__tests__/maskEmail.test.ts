import { describe, it, expect } from "vitest";
import { maskEmail } from "../utils/maskEmail.js";

describe("maskEmail", () => {
  it.each([
    ["ana@x.com", "a***@x.com"],
    ["a@x.com", "a***@x.com"],
    ["ana.perez@sub.empresa.com", "a***@sub.empresa.com"],
    ["Ana@X.com", "A***@X.com"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(maskEmail(entrada)).toBe(esperado);
  });

  it("sin arroba: no filtra el valor original", () => {
    expect(maskEmail("raro")).toBe("***");
  });
});
