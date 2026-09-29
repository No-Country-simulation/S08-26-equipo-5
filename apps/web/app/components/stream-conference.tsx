"use client";

import {
  CallControls,
  SpeakerLayout,
  StreamCall,
  StreamVideo,
} from "@stream-io/video-react-sdk";
import { Call, CallingState, StreamVideoClient } from "@stream-io/video-client";
import { useEffect, useState, useRef } from "react";
import { StreamChatPanel } from "./stream-chat-panel";

type StreamConferenceProps = {
  apiKey: string;
  token: string;
  user: {
    id: string;
    name: string;
  };
  callType: string;
  callId: string;
  onLeave?: (error?: Error) => void;
};

export function StreamConference({
  apiKey,
  token,
  user,
  callType,
  callId,
  onLeave,
}: StreamConferenceProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    let active = true;
    if (!callType || !callId) {
      return;
    }

    const nextClient = StreamVideoClient.getOrCreateInstance({
      apiKey,
      user: { id: user.id, name: user.name },
      token,
    });
    const call = nextClient.call(callType, callId);

    void nextClient
      .connectUser({ id: user.id, name: user.name }, token)
      .then(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "El navegador no permite acceder a la cámara desde este contexto.",
          );
        }

        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        permissionStream.getTracks().forEach((track) => track.stop());
        await call.join({ create: false });
      })
      .then(async () => {
        await call.camera.enable();
        await call.microphone.enable();
        if (active) {
          setClient(nextClient);
          setCall(call);
        }
      })
      .catch((joinError) => {
        if (active) {
          setError(
            joinError instanceof Error
              ? joinError.message
              : "No se pudo conectar a la videollamada.",
          );
        }
        void nextClient.disconnectUser();
      });

    return () => {
      active = false;
      if (call.state.callingState !== CallingState.LEFT) {
        void call.leave();
      }
      void nextClient.disconnectUser();
    };
  }, [apiKey, callId, callType, token, user.id, user.name]);

  if (!callType || !callId) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        El identificador de la llamada de GetStream no es válido.
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!client) {
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
        Conectando a la videollamada…
      </p>
    );
  }

  if (!call) {
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-slate-600">
        Preparando la videollamada…
      </p>
    );
  }

  return (
    <div ref={containerRef} className="str-video overflow-hidden rounded-2xl bg-slate-950 shadow-sm">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <div className="stream-conference-layout">
            {/* ── Video area ── */}
            <div className="stream-conference-layout__video">
              <div className="stream-conference-layout__video-inner">
                <SpeakerLayout participantsBarPosition="bottom" />
              </div>
              <div className="stream-conference-layout__controls">
                <CallControls onLeave={onLeave} />
                {/* Chat toggle button */}
                <button
                  type="button"
                  id="toggle-chat-btn"
                  onClick={() => setChatOpen((v) => !v)}
                  className="stream-conference-layout__chat-toggle"
                  aria-label={chatOpen ? "Cerrar chat" : "Abrir chat"}
                  title={chatOpen ? "Cerrar chat" : "Abrir chat"}
                >
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </button>
                {/* Fullscreen toggle button */}
                <button
                  type="button"
                  id="toggle-fullscreen-btn"
                  onClick={toggleFullscreen}
                  className="stream-conference-layout__chat-toggle"
                  aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                  title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
                >
                  {isFullscreen ? (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* ── Chat sidebar ── */}
            {chatOpen && (
              <div className="stream-conference-layout__chat">
                <StreamChatPanel
                  apiKey={apiKey}
                  token={token}
                  user={user}
                  channelId={callId}
                />
              </div>
            )}
          </div>
        </StreamCall>
      </StreamVideo>
    </div>
  );
}
