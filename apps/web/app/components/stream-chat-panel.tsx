"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { StreamVideoClient } from "@stream-io/video-client";
import { useStreamChat, type ChatMessage } from "../lib/use-stream-chat";

type StreamChatPanelProps = {
  apiKey: string;
  token: string;
  user: { id: string; name: string };
  channelId: string;
};

export function StreamChatPanel({
  apiKey,
  token,
  user,
  channelId,
}: StreamChatPanelProps) {
  const { messages, send, connected, error } = useStreamChat({
    apiKey,
    token,
    user,
    channelId,
  });

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messagesContainerRef.current) {
      const el = messagesContainerRef.current;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    try {
      await send(trimmed);
    } catch {
      setText(trimmed); // Restore on error
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }

  // Color palette for avatars based on userId hash
  const avatarColors = [
    "from-violet-500 to-purple-600",
    "from-blue-500 to-cyan-600",
    "from-emerald-500 to-teal-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-indigo-500 to-blue-600",
  ];

  function getAvatarColor(userId: string) {
    let hash = 0;
    for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) & 0xff;
    return avatarColors[hash % avatarColors.length];
  }

  return (
    <div className="stream-chat-panel">
      {/* Header */}
      <div className="stream-chat-panel__header">
        <div className="stream-chat-panel__header-left">
          <div
            className={`stream-chat-panel__status-dot ${connected ? "stream-chat-panel__status-dot--connected" : ""}`}
          />
          <span className="stream-chat-panel__header-title">Chat</span>
        </div>
        <span className="stream-chat-panel__status-label">
          {connected ? "En línea" : "Conectando…"}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="stream-chat-panel__error" role="alert">
          <svg
            className="stream-chat-panel__error-icon"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          {error}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="stream-chat-panel__messages" aria-label="Mensajes del chat">
        {messages.length === 0 ? (
          <div className="stream-chat-panel__empty">
            <div className="stream-chat-panel__empty-icon">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="stream-chat-panel__empty-text">
              {connected ? "Sé el primero en escribir…" : "Cargando chat…"}
            </p>
          </div>
        ) : (
          <ul className="stream-chat-panel__messages-list">
            {groupMessagesByUser(messages).map((group) => (
              <li
                key={group[0].id}
                className={`stream-chat-panel__message-group ${
                  group[0].isOwn ? "stream-chat-panel__message-group--own" : ""
                }`}
              >
                {/* Avatar — only for others */}
                {!group[0].isOwn && (
                  <div
                    className={`stream-chat-panel__avatar bg-gradient-to-br ${getAvatarColor(group[0].userId)}`}
                    aria-hidden="true"
                  >
                    {getInitials(group[0].userName)}
                  </div>
                )}

                <div className="stream-chat-panel__message-group-content">
                  {/* Sender name — only for others */}
                  {!group[0].isOwn && (
                    <span className="stream-chat-panel__sender-name">
                      {group[0].userName}
                    </span>
                  )}

                  {/* Bubbles */}
                  {group.map((msg, i) => (
                    <div
                      key={msg.id}
                      className={`stream-chat-panel__bubble ${
                        msg.isOwn
                          ? "stream-chat-panel__bubble--own"
                          : "stream-chat-panel__bubble--other"
                      } ${i === group.length - 1 ? "stream-chat-panel__bubble--last" : ""}`}
                    >
                      <p className="stream-chat-panel__bubble-text">{msg.text}</p>
                      {i === group.length - 1 && (
                        <span className="stream-chat-panel__bubble-time">
                          {formatTime(msg.createdAt)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Input */}
      <div className="stream-chat-panel__input-area">
        <textarea
          ref={inputRef}
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje… (Enter para enviar)"
          disabled={!connected || sending}
          rows={1}
          className="stream-chat-panel__textarea"
          aria-label="Escribir mensaje"
        />
        <button
          type="button"
          id="chat-send-btn"
          onClick={() => void handleSend()}
          disabled={!connected || !text.trim() || sending}
          className="stream-chat-panel__send-btn"
          aria-label="Enviar mensaje"
        >
          {sending ? (
            <span className="stream-chat-panel__send-spinner" />
          ) : (
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

/** Group consecutive messages from the same user for a cleaner UI */
function groupMessagesByUser(messages: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    if (last && last[0].userId === msg.userId) {
      last.push(msg);
    } else {
      groups.push([msg]);
    }
  }
  return groups;
}
