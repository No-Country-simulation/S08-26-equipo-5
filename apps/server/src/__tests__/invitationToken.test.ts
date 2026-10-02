import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../utils/invitationToken.js";

describe("invitationToken", () => {
  it("genera 32 bytes aleatorios codificados en base64url", () => {
    const token = generateInvitationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("dos tokens generados son distintos", () => {
    expect(generateInvitationToken()).not.toBe(generateInvitationToken());
  });

  it("el hash es SHA-256 hex estable (64 chars) y difiere entre tokens", () => {
    // sha256("abc")
    expect(hashInvitationToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashInvitationToken("abc")).toBe(hashInvitationToken("abc"));
    expect(hashInvitationToken("abd")).not.toBe(hashInvitationToken("abc"));
  });

  it("el hash no contiene el token en claro", () => {
    const token = generateInvitationToken();

    expect(hashInvitationToken(token)).not.toContain(token);
    expect(hashInvitationToken(token)).toHaveLength(64);
  });
});
