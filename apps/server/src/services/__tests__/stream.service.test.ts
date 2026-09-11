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
  describe("initStreamClient", () => {
    it("debería crear cliente con env vars válidas", () => {
      process.env.GETSTREAM_API_KEY = "test-key";
      process.env.GETSTREAM_API_SECRET = "test-secret";

      const client = initStreamClient();

      expect(client).toBeDefined();
      expect(client.video).toBeDefined();
    });

    it("debería fallar si falta GETSTREAM_API_KEY", () => {
      delete process.env.GETSTREAM_API_KEY;
      process.env.GETSTREAM_API_SECRET = "test-secret";

      expect(() => initStreamClient()).toThrow("GETSTREAM_API_KEY");
    });

    it("debería fallar si falta GETSTREAM_API_SECRET", () => {
      process.env.GETSTREAM_API_KEY = "test-key";
      delete process.env.GETSTREAM_API_SECRET;

      expect(() => initStreamClient()).toThrow("GETSTREAM_API_SECRET");
    });

    it("debería retornar la misma instancia en llamadas sucesivas", () => {
      process.env.GETSTREAM_API_KEY = "test-key";
      process.env.GETSTREAM_API_SECRET = "test-secret";

      const client1 = initStreamClient();
      const client2 = initStreamClient();

      expect(client1).toBe(client2);
    });
  });

  // ─── createRoom ──────────────────────────────────────────
  describe("createRoom", () => {
    const mockCid = "default:abc-123";

    beforeEach(() => {
      process.env.GETSTREAM_API_KEY = "test-key";
      process.env.GETSTREAM_API_SECRET = "test-secret";

      mockGetOrCreate.mockResolvedValue({
        call: { cid: mockCid, id: "abc-123", type: "default" },
      });
    });

    it("debería crear sala y retornar streamRoomId", async () => {
      const result = await createRoom("Sala Reunión");

      expect(result).toEqual({ streamRoomId: mockCid });
      expect(mockGetOrCreate).toHaveBeenCalledWith({
        data: { custom: { name: "Sala Reunión" } },
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
      process.env.GETSTREAM_API_KEY = "test-key";
      process.env.GETSTREAM_API_SECRET = "test-secret";

      mockGenerateCallToken.mockReturnValue(mockToken);
    });

    it("debería generar token para HOST", () => {
      const token = generateToken("user-123", "HOST", "default:room-1");

      expect(token).toBe(mockToken);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-123",
        call_cids: ["default:room-1"],
        role: "admin",
      });
    });

    it("debería generar token para PARTICIPANTE", () => {
      const token = generateToken("user-456", "PARTICIPANTE", "default:room-1");

      expect(token).toBe(mockToken);
      expect(mockGenerateCallToken).toHaveBeenCalledWith({
        user_id: "user-456",
        call_cids: ["default:room-1"],
        role: "user",
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
