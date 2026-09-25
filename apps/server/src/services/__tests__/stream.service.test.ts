import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ValidationError } from "../../errors/index.js";

// ─── Mock @stream-io/node-sdk ────────────────────────────────
const mockGetOrCreate = vi.fn();
const mockGenerateCallToken = vi.fn();

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn().mockImplementation(() => ({
    video: {
      call: vi.fn().mockReturnValue({
        getOrCreate: mockGetOrCreate,
      }),
    },
    generateCallToken: mockGenerateCallToken,
  })),
}));

// randomUUID determinístico para poder aserir el callId generado por createRoom.
vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "abc-123"),
}));

// ─── Imports después del mock ────────────────────────────────
import {
  initStreamClient,
  createRoom,
  generateToken,
  resetStreamClient,
} from "../stream.service.js";

describe("stream.service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStreamClient();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─── initStreamClient ─────────────────────────────────────
  // Nota: GETSTREAM_API_KEY/SECRET se validan una sola vez al arrancar el
  // proceso (config/env.ts → requireEnv, fail-fast). initStreamClient ya no
  // lee process.env directamente, así que no tiene sentido testear que
  // falle "por variable faltante" mutando process.env en caliente.
  describe("initStreamClient", () => {
    it("debería crear cliente con las credenciales configuradas", () => {
      const client = initStreamClient();

      expect(client).toBeDefined();
      expect(client.video).toBeDefined();
    });

    it("debería retornar la misma instancia en llamadas sucesivas", () => {
      const client1 = initStreamClient();
      const client2 = initStreamClient();

      expect(client1).toBe(client2);
    });
  });

  // ─── createRoom ──────────────────────────────────────────
  describe("createRoom", () => {
    const mockCid = "default:abc-123";

    beforeEach(() => {
      mockGetOrCreate.mockResolvedValue({
        call: { cid: mockCid, id: "abc-123", type: "default" },
      });
    });

    it("debería crear sala y retornar streamRoomId, callType y callId", async () => {
      const result = await createRoom("Sala Reunión");

      expect(result).toEqual({
        streamRoomId: mockCid,
        callType: "default",
        callId: "abc-123",
      });
      expect(mockGetOrCreate).toHaveBeenCalledWith({
        data: { custom: { name: "Sala Reunión" }, created_by_id: "system" },
      });
    });

    it("debería lanzar error si GetStream falla", async () => {
      mockGetOrCreate.mockRejectedValue(new Error("Rate limit exceeded"));

      await expect(createRoom("Sala Test")).rejects.toThrow(
        "GetStream createCall failed: Rate limit exceeded"
      );
    });
  });

  // ─── generateToken ───────────────────────────────────────
  describe("generateToken", () => {
    const mockToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock";

    beforeEach(() => {
      mockGenerateCallToken.mockReturnValue(mockToken);
    });

    it("debería generar token para HOST", () => {
      const result = generateToken("user-123", "HOST", "default:room-1");

      expect(result.token).toBe(mockToken);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-123",
        call_cids: ["default:room-1"],
        role: "admin",
        validity_in_seconds: expect.any(Number),
      });
    });

    it("debería generar token para PARTICIPANTE", () => {
      const result = generateToken("user-456", "PARTICIPANTE", "default:room-1");

      expect(result.token).toBe(mockToken);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-456",
        call_cids: ["default:room-1"],
        role: "user",
        validity_in_seconds: expect.any(Number),
      });
    });

    it("debería lanzar ValidationError para role inválido", () => {
      expect(() =>
        generateToken("user-123", "INVALID_ROLE" as any, "default:room-1")
      ).toThrow(ValidationError);
    });

    it("debería incluir roles válidos en el mensaje de error", () => {
      try {
        generateToken("user-123", "INVALID_ROLE" as any, "default:room-1");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toContain("HOST");
        expect((error as Error).message).toContain("PARTICIPANTE");
      }
    });
  });
});
