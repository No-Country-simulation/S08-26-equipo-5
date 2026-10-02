"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../../lib/auth";
import { getGuestSession } from "../../lib/guest-session";
import {
  getRealtimeUrl,
  getSalaByCode,
  getStreamToken,
  type StreamTokenResponse,
} from "../../lib/salas-api";
import { StreamConference } from "../../components/stream-conference";
import { HostRequestPanel } from "../../components/host-request-panel";
import { useHostSocket } from "../../lib/host-socket";

function RoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const requestedCallId = searchParams.get("callId") ?? "";
  const salaId = searchParams.get("salaId") ?? "";
  const isDemo = searchParams.get("demo") === "true" || code === "DEMO-123";
  const isHost = searchParams.get("host") === "true";
  const [grantedHost, setGrantedHost] = useState(false);
  const actsAsHost = isHost || grantedHost;
  const grantHost = useCallback(() => setGrantedHost(true), []);
  const hasRealAccess = Boolean(code && !isDemo);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("Preparando conexión…");
  const [connectionError, setConnectionError] = useState("");
  const [streamConnection, setStreamConnection] = useState<StreamTokenResponse | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [callId, setCallId] = useState(requestedCallId);
  const { accessToken } = useAuth();
  const guestSession = getGuestSession();
  const roomAccessToken =
    guestSession?.salaId === salaId ? guestSession.accessToken : accessToken;
  const {
    requests,
    approve,
    reject,
    connected: hostSocketConnected,
    error: hostSocketError,
  } = useHostSocket({
    salaCodigo: actsAsHost ? code : null,
    salaId: actsAsHost ? salaId : null,
    accessToken: actsAsHost ? accessToken : null,
  });

  async function copyRoomCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setLinkCopied(false);
    }
  }

  useEffect(() => {
    if (isDemo || !salaId || !roomAccessToken) return;

    const socket = io(`${getRealtimeUrl()}/reuniones`, {
      transports: ["websocket"],
      auth: { token: roomAccessToken },
    });

    socket.on("room:ended", (payload: { salaId?: string }) => {
      if (payload.salaId === salaId) router.replace("/home");
    });

    socket.on("connect", () => {
      if (actsAsHost) {
        socket.emit(
          "host:subscribe",
          { salaId },
          (ack: { ok?: boolean; error?: { message?: string } }) => {
            if (!ack?.ok) {
              setConnectionError(
                ack?.error?.message ?? "No se pudo escuchar el cierre de la sala.",
              );
            }
          },
        );
      }

      void getSalaByCode(code)
        .then((sala) => {
          if (sala.estado === "FINALIZADA") router.replace("/home");
        })
        .catch((error: unknown) => {
          setConnectionError(
            error instanceof Error
              ? error.message
              : "No se pudo verificar el estado de la sala.",
          );
        });
    });

    socket.on("connect_error", (error: Error) => {
      setConnectionError(
        error.message || "No se pudo conectar para recibir el estado de la sala.",
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [actsAsHost, code, isDemo, roomAccessToken, router, salaId]);

  useEffect(() => {
    if (isDemo || !salaId) return;

    let active = true;
    const token = roomAccessToken;
    if (!token) return;

    void getStreamToken(salaId, token)
      .then((connection) => {
        if (active) {
          setStreamConnection(connection);
          setCallId(connection.callCid);
          setConnectionStatus("Conectando a la videollamada…");
        }
      })
      .catch((error) => {
        if (active) {
          setConnectionStatus("Vista previa local");
          setConnectionError(
            error instanceof Error
              ? error.message
              : "No se pudo preparar la conexión con la videollamada.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [isDemo, roomAccessToken, salaId]);

  useEffect(() => {
    if (!isDemo && !hasRealAccess) return;

    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled)
          setMediaError("No se pudo acceder a la cámara o al micrófono.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [isDemo, hasRealAccess]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = microphoneEnabled;
    });
  }, [microphoneEnabled]);

  if (hasRealAccess && !streamConnection) {
    return (
      <section className="room-loading-state" role={connectionError ? "alert" : "status"}>
        {connectionError ? (
          <div className="room-loading-state__message">
            <p>{connectionError}</p>
            <Link href="/home">Volver al inicio</Link>
          </div>
        ) : (
          <div className="room-loading-state__message">
            <span className="room-loading-spinner" aria-hidden="true" />
            <p>Preparando la sala…</p>
          </div>
        )}
      </section>
    );
  }

  // No code → not accessed correctly
  if (!code) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-950">Sala de reunión</h1>
        <p className="mt-4 text-slate-600">
          No se encontró el código de sala. Ingresá desde la{" "}
          <Link href="/home" className="font-semibold text-blue-600 hover:underline">
            página de inicio
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className={streamConnection ? "room-page" : "space-y-8"}>
      {!streamConnection ? <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          {isDemo ? "Modo demo local" : "Sala de reunión"}
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Sala de reunión
        </h1>
        {code && (
          <p className="mt-2 text-sm text-slate-500">
            Código: <strong className="font-mono tracking-widest text-slate-950">{code}</strong>
            {callId && (
              <>
                {" · "}Call ID:{" "}
                <span className="font-mono text-slate-400">{callId}</span>
              </>
            )}
          </p>
        )}
        {isDemo && (
          <p className="mt-3 text-slate-600">
            Esta vista prueba el preview y los controles sin conectarse al backend.
          </p>
        )}
        {!isDemo && (
          <p className="mt-3 text-sm text-slate-600">
            Estado de conexión: <strong>{connectionStatus}</strong>
          </p>
        )}
      </div> : (
        <header className="room-page__header">
          <h1>Reunión MeetFlow</h1>
          <div className="room-page__share-link">
            <p title={`Código de sala: ${code}`}>{code}</p>
            <button type="button" onClick={() => void copyRoomCode()} aria-label="Copiar código de la sala" title="Copiar código de la sala">
              {linkCopied ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
              )}
            </button>
            <span aria-live="polite" className="room-page__copy-status">{linkCopied ? "Copiado" : ""}</span>
          </div>
        </header>
      )}

      <div className={streamConnection ? "room-page__call" : "grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]"}>
        {/* Video preview */}
        <div className={streamConnection ? "room-page__conference" : "overflow-hidden rounded-2xl bg-slate-950 shadow-sm"}>
          {streamConnection ? (
            <StreamConference
              apiKey={streamConnection.apiKey}
              token={streamConnection.token}
              user={{
                id: streamConnection.user.id,
                name: streamConnection.user.name,
                image: streamConnection.user.image ?? null,
              }}
              callType={streamConnection.callType}
              callId={streamConnection.callId}
              salaId={salaId}
              isHost={isHost}
              requests={requests}
              requestsConnected={hostSocketConnected}
              requestsError={hostSocketError}
              onApproveRequest={approve}
              onRejectRequest={reject}
              onBecameHost={grantHost}
              onLeave={(error) => {
                if (error) {
                  setConnectionError(error.message);
                  return;
                }
                router.replace("/home");
              }}
            />
          ) : (
          <>
            <div className="relative aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Vista previa de tu cámara"
              className={`h-full w-full object-cover ${cameraEnabled ? "" : "hidden"}`}
            />
            {!cameraEnabled && (
              <div className="flex h-full items-center justify-center text-slate-300">
                Cámara apagada
              </div>
            )}
            <span className="absolute bottom-4 left-4 rounded-full bg-slate-950/75 px-3 py-1.5 text-sm text-white">
              Vos
            </span>
            </div>
            <div className="flex flex-wrap gap-3 p-4">
            <button
              type="button"
              id="toggle-camera-btn"
              onClick={() => setCameraEnabled((v) => !v)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {cameraEnabled ? "Apagar cámara" : "Encender cámara"}
            </button>
            <button
              type="button"
              id="toggle-mic-btn"
              onClick={() => setMicrophoneEnabled((v) => !v)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {microphoneEnabled ? "Silenciar micrófono" : "Activar micrófono"}
            </button>
            </div>
          </>
          )}
        </div>

        {/* Sidebar */}
        {!streamConnection && <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm h-fit">
          <details className="group" open={!streamConnection}>
            <summary className="text-xl font-semibold text-slate-950 cursor-pointer list-none flex items-center justify-between outline-none">
              Participantes y opciones
              <svg
                className="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="mt-6">
              <div className="space-y-3">
                <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
                  Vos · conectado
                </p>
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  {isDemo ? "Host demo · conectado" : "Esperando a otros participantes…"}
                </p>
              </div>

              {mediaError && (
                <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {mediaError}
                </p>
              )}
              {connectionError && (
                <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {connectionError}
                </p>
              )}
              {isHost && (
                <div className="mt-6 border-t border-slate-200 pt-6">
                  <h3 className="text-lg font-semibold text-slate-950">Solicitudes de ingreso</h3>
                  <div className="mt-4">
                    <HostRequestPanel
                      requests={requests}
                      connected={hostSocketConnected}
                      error={hostSocketError}
                      onApprove={approve}
                      onReject={reject}
                    />
                  </div>
                </div>
              )}

              <Link
                href={`/waiting-room?code=${encodeURIComponent(code)}${isDemo ? "&demo=true" : ""}`}
                id="back-to-waiting-room-btn"
                className="mt-6 inline-flex w-full justify-center rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
              >
                ← Volver a sala de espera
              </Link>
            </div>
          </details>
        </aside>}
      </div>
    </section>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={<section className="room-loading-state" role="status"><span className="room-loading-spinner" aria-hidden="true" /><span className="sr-only">Cargando sala…</span></section>}>
      <RoomContent />
    </Suspense>
  );
}
