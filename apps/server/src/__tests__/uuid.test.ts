import { describe, expect, it } from "vitest";
import { AppError } from "../utils/AppError.js";
import { assertUuid } from "../utils/uuid.js";

describe("assertUuid", () => {
  it("acepta un UUID", () => {
    expect(() =>
      assertUuid("00000000-0000-4000-8000-000000000099"),
    ).not.toThrow();
  });

  it("rechaza un id que no es UUID con 400 VALIDATION_ERROR", () => {
    expect(() => assertUuid("no-es-un-uuid")).toThrow(AppError);
    try {
      assertUuid("no-es-un-uuid");
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    }
  });
});
