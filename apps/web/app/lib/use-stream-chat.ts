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

/**
 * StreamChat.getInstance devuelve un singleton por apiKey para toda la
 * pestaña. Cada reunión usa un usuario distinto (el Participante.id), así que
 * antes de conectar hay que soltar al usuario anterior. Las operaciones se
 * encadenan en esta cola para que dos efectos (StrictMode, cambio de token o
 * de sala) no llamen a connectUser en paralelo.
 */
let chatQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chatQueue.then(task, task);
  chatQueue = run.catch(() => undefined);
  return run;
}

async function ensureChatUser(
  client: StreamChat,
  user: { id: string; name: string },
  token: string,
) {
  if (client.userID && client.userID !== user.id) {
    await client.disconnectUser();
  }
  if (client.userID !== user.id) {
    try {
      await client.connectUser({ id: user.id, name: user.name }, token);
    } catch (error) {
      // Un connectUser fallido puede dejar userID seteado sin conexión: se
      // limpia para que el próximo intento con el mismo usuario reconecte.
      await client.disconnectUser().catch(() => {});
      throw error;
    }
  }
}

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

    const client = StreamChat.getInstance(apiKey);

    const safeChannelId = channelId
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64);

    async function setup() {
      await enqueue(() => ensureChatUser(client, user, token));

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
      // El chat y el video son clientes independientes: desconectar el chat no
      // afecta la llamada. Se hace en la cola para no cortar un connectUser en
      // curso; si un efecto nuevo (StrictMode) vuelve a montar con el mismo
      // usuario, ensureChatUser reconecta después de este disconnect.
      void enqueue(async () => {
        if (client.userID === user.id) await client.disconnectUser();
      }).catch(() => {});
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
