import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpsertUsers, mockUpdateMembers } = vi.hoisted(() => ({
  mockUpsertUsers: vi.fn(),
  mockUpdateMembers: vi.fn(),
}));

vi.mock("@stream-io/node-sdk", () => ({
  StreamClient: vi.fn().mockImplementation(() => ({
    upsertUsers: mockUpsertUsers,
    video: { call: vi.fn().mockReturnValue({ updateCallMembers: mockUpdateMembers }) },
    generateCallToken: vi.fn().mockReturnValue("tok"),
  })),
}));

vi.mock("../../config/env.js", () => ({
  env: {
    nodeEnv: "test",
    getstreamApiKey: "k",
    getstreamApiSecret: "s",
    streamTokenTtlSeconds: 3600,
  },
}));

import { issueCallAccess, resetStreamClient, upsertStreamUser } from "../stream.service.js";

beforeEach(() => {
  vi.clearAllMocks();
  resetStreamClient();
  mockUpsertUsers.mockResolvedValue({});
  mockUpdateMembers.mockResolvedValue({});
});

describe("GetStream — avatar del usuario", () => {
  it("upsertStreamUser envía image cuando hay foto", async () => {
    await upsertStreamUser({ id: "p1", name: "Ana", isRegistered: true, image: "https://cdn/v1/a.jpg" });
    expect(mockUpsertUsers).toHaveBeenCalledWith([
      expect.objectContaining({ id: "p1", name: "Ana", image: "https://cdn/v1/a.jpg" }),
    ]);
  });

  it("upsertStreamUser no envía image si no hay foto", async () => {
    await upsertStreamUser({ id: "p2", name: "Luz", image: null });
    const [[user]] = mockUpsertUsers.mock.calls[0] as [[Record<string, unknown>]];
    expect(user.image).toBeUndefined();
  });

  it("issueCallAccess propaga image al upsert", async () => {
    await issueCallAccess({
      userId: "p1",
      name: "Ana",
      role: "HOST",
      callType: "default",
      callId: "c1",
      isRegistered: true,
      image: "https://cdn/v1/a.jpg",
    });
    expect(mockUpsertUsers).toHaveBeenCalledWith([
      expect.objectContaining({ image: "https://cdn/v1/a.jpg" }),
    ]);
  });
});
