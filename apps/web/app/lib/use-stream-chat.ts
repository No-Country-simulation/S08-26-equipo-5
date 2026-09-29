"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { StreamChat, type Channel, type MessageResponse } from "stream-chat";

export type ChatMessage = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  createdAt: Date;
  isOwn: boolean;
};

type UseStreamChatOptions = {
  apiKey: string;
  token: string;
  user: { id: string; name: string };
  /** Use the callId as the channel ID so all participants share the same channel */
  channelId: string;
};

type UseStreamChatReturn = {
  messages: ChatMessage[];
  send: (text: string) => Promise<void>;
  connected: boolean;
  error: string;
};

export function useStreamChat({
  apiKey,
  token,
  user,
  channelId,
}: UseStreamChatOptions): UseStreamChatReturn {
  const channelRef = useRef<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!apiKey || !token || !user.id || !channelId) return;

    let active = true;

    // Use getInstance so we share the singleton — but we must NOT call
    // connectUser if the client is already connected to this same user.
    const client = StreamChat.getInstance(apiKey);

    const safeChannelId = channelId
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64);

    async function setup() {
      // If already connected as this user, skip connectUser
      if (
        client.userID !== user.id ||
        client.tokenManager.token === null
      ) {
        await client.connectUser({ id: user.id, name: user.name }, token);
      }

      if (!active) return;

      const channel = client.channel("livestream", safeChannelId);

      channelRef.current = channel;

      const state = await channel.watch();

      if (!active) return;

      const existing: ChatMessage[] = (state.messages ?? []).map((m) =>
        toMessage(m, user.id)
      );
      setMessages(existing);
      setConnected(true);
      setError("");

      channel.on("message.new", (event) => {
        if (!event.message) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message!.id)) return prev;
          return [...prev, toMessage(event.message!, user.id)];
        });
      });
    }

    setup().catch((err: unknown) => {
      if (!active) return;
      setError(
        err instanceof Error ? err.message : "No se pudo conectar al chat."
      );
    });

    return () => {
      active = false;
      channelRef.current?.stopWatching().catch(() => {});
      channelRef.current = null;
      setConnected(false);
      setMessages([]);
      // Do NOT disconnect the StreamChat client here —
      // the StreamVideoClient depends on the same underlying WS connection.
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, token, user.id, user.name, channelId]);

  const send = useCallback(async (text: string) => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Canal de chat no disponible.");
    const trimmed = text.trim();
    if (!trimmed) return;
    await channel.sendMessage({ text: trimmed });
  }, []);

  return { messages, send, connected, error };
}

function toMessage(m: MessageResponse, currentUserId: string): ChatMessage {
  return {
    id: m.id,
    text: m.text ?? "",
    userId: m.user?.id ?? "unknown",
    userName: m.user?.name ?? m.user?.id ?? "Participante",
    createdAt: new Date(m.created_at ?? Date.now()),
    isOwn: m.user?.id === currentUserId,
  };
}
