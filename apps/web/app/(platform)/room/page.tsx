"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../lib/auth";
import { generateRoomToken, getSalaDetalle } from "../../lib/salas-api";
import { StreamConference } from "../../components/stream-conference";
import { HostRequestPanel } from "../../components/host-request-panel";
import { useHostSocket } from "../../lib/host-socket";

const STREAM_API_KEY = process.env.NEXT_PUBLIC_GETSTREAM_API_KEY;

function RoomContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const requestedCallId = searchParams.get("callId") ?? "";
  const salaId = searchParams.get("salaId") ?? "";
  const isDemo = searchParams.get("demo") === "true" || code === "DEMO-123";
  const isHost = searchParams.get("host") === "true";
  const hasRealAccess = Boolean(code && !isDemo);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState("Preparando conexión…");
  const [connectionError, setConnectionError] = useState("");
  const [streamToken, setStreamToken] = useState("");
  const [callId, setCallId] = useState(requestedCallId);
  const { user, accessToken, isAuthenticated } = useAuth();
  const {
    requests,
    approve,
    reject,
    connected: hostSocketConnected,
  } = useHostSocket({
    salaCodigo: isHost ? code : null,
    salaId: isHost ? salaId : null,
    accessToken: isHost ? accessToken : null,
  });

  useEffect(() => {
    setCallId(requestedCallId);
  }, [requestedCallId]);

  useEffect(() => {
    if (isDemo || !salaId || requestedCallId) return;

    let active = true;
    void getSalaDetalle(salaId)
      .then((sala) => {
        if (!active) return;
        if (!sala.streamRoomId) {
          setConnectionError("La sala todavía no está sincronizada con GetStream.");
          return;
        }
        setCallId(sala.streamRoomId);
      })
      .catch((error) => {
        if (active) {
          setConnectionError(
            error instanceof Error
              ? error.message
              : "No se pudo obtener la información de la sala.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [isDemo, requestedCallId, salaId]);

  useEffect(() => {
    if (isDemo || !salaId || !user?.id || !isAuthenticated) return;

    let active = true;
    void generateRoomToken(salaId, user.id, "HOST")
      .then(({ token }) => {
        if (active) {
          setStreamToken(token);
          setConnectionStatus("Token de anfitrión listo");
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
  }, [isAuthenticated, isDemo, salaId, user?.id]);

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
    <section className="space-y-8">
      <div>
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        {/* Video preview */}
        <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-sm">
          {STREAM_API_KEY && streamToken && callId && user ? (
            <StreamConference
              apiKey={STREAM_API_KEY}
              token={streamToken}
              user={{
                id: user.id,
                name: `${user.nombre} ${user.apellido}`,
              }}
              callCid={callId}
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
        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Participantes</h2>
          <div className="mt-4 space-y-3">
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
        </aside>
      </div>
    </section>
  );
}

export default function RoomPage() {
  return (
    <Suspense fallback={<section>Cargando sala…</section>}>
      <RoomContent />
    </Suspense>
  );
}
