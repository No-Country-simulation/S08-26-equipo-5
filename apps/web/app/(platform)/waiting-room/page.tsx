"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { HostRequestPanel } from "../../components/host-request-panel";
import { useAuth } from "../../lib/auth";
import {
  getGuestSession,
  clearGuestSession,
  saveGuestSession,
  updateGuestSessionToken,
  type GuestSession,
} from "../../lib/guest-session";
import { useHostSocket } from "../../lib/host-socket";
import {
  getRealtimeUrl,
  getMiEstado,
  getSalaByCode,
  joinSala,
  ApiRequestError,
  type Sala,
} from "../../lib/salas-api";

type JoinStatus = "idle" | "waiting" | "approved" | "rejected";

type JoinApprovedPayload = {
  participanteId: string;
  accessToken: string;
  sala?: { codigo?: string };
};

type JoinRejectedPayload = {
  sala?: { codigo?: string };
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function toJoinStatus(estado: "PENDIENTE" | "APROBADO" | "RECHAZADO"): JoinStatus {
  if (estado === "PENDIENTE") return "waiting";
  if (estado === "APROBADO") return "approved";
  return "rejected";
}

// ---------------------------------------------------------------------------
// Participant view
// ---------------------------------------------------------------------------
function ParticipantView({
  sala,
  code,
  isDemo,
}: {
  sala: Sala;
  code: string;
  isDemo: boolean;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [mediaError, setMediaError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");
  const [participantId, setParticipantId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [participantSession, setParticipantSession] = useState<GuestSession | null>(null);
  const [participantIsHost, setParticipantIsHost] = useState(false);
  const resolutionRef = useRef<JoinStatus | null>(null);
  const [joinForm, setJoinForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
  });
  const { isAuthenticated, user } = useAuth();
  // countdown before auto-redirect
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      resolutionRef.current = null;
      const session = getGuestSession();
      if (session?.salaId !== sala.id) {
        setParticipantId("");
        setParticipantSession(null);
        setParticipantIsHost(false);
        setJoinStatus("idle");
        setCountdown(null);
        return;
      }
      setParticipantId(session.participanteId);
      setParticipantSession(session);
      setJoinStatus("waiting");
    });
    return () => {
      active = false;
    };
  }, [sala.id]);

  // Camera preview
  useEffect(() => {
    let cancelled = false;

    async function startPreview() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      setMediaError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (error) {
        if (!cancelled)
          setMediaError(
            getErrorMessage(error, "No se pudo acceder a la cámara y al micrófono.")
          );
      }
    }

    void startPreview();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [sala]);

  // Toggle tracks
  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);
  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = microphoneEnabled;
    });
  }, [microphoneEnabled]);

  // The participant JWT authenticates the socket and subscribes it to room events.
  useEffect(() => {
    if (isDemo || !participantSession || participantSession.salaId !== sala.id) return;

    const salaCode = sala.codigo;
    const socket = io(`${getRealtimeUrl()}/reuniones`, {
      transports: ["websocket"],
      autoConnect: false,
      auth: { token: participantSession.accessToken },
    });
    socketRef.current = socket;

    function belongsToSala(payload: { sala?: { codigo?: string } }) {
      return !payload.sala?.codigo || payload.sala.codigo === salaCode;
    }

    socket.on("join:approved", (payload: JoinApprovedPayload) => {
      if (!belongsToSala(payload)) return;
      if (payload.participanteId !== participantSession.participanteId) return;
      resolutionRef.current = "approved";
      updateGuestSessionToken(payload.accessToken);
      setParticipantSession((current) =>
        current ? { ...current, accessToken: payload.accessToken } : current,
      );
      setJoinStatus("approved");
      setCountdown(3);
    });

    socket.on("join:rejected", (payload: JoinRejectedPayload) => {
      if (belongsToSala(payload)) {
        resolutionRef.current = "rejected";
        setJoinStatus("rejected");
      }
    });

    socket.on("connect_error", (error) => {
      setJoinError(getErrorMessage(error, "No se pudo conectar con la sala."));
      if (error.message === "INVALID_TOKEN") {
        clearGuestSession();
        resolutionRef.current = null;
        setParticipantSession(null);
        setParticipantId("");
        setJoinStatus("idle");
        setCountdown(null);
      }
    });

    socket.on("error", (error: { message?: string }) => {
      setJoinError(error.message ?? "No se pudo recuperar el estado de ingreso.");
    });

    socket.on("connect", () => {
      socket.emit(
        "join:subscribe",
        { participanteId: participantSession.participanteId },
        (ack: { ok?: boolean; error?: { message?: string } }) => {
          if (!ack?.ok) {
            setJoinError(ack?.error?.message ?? "No se pudo recuperar la solicitud.");
          }
        },
      );

      void getMiEstado(sala.id, participantSession.accessToken)
        .then((mine) => {
          setParticipantIsHost(mine.rol === "HOST");
          if (resolutionRef.current) return;
          resolutionRef.current = toJoinStatus(mine.estado);
          setJoinStatus(toJoinStatus(mine.estado));
          if (mine.estado === "APROBADO") setCountdown(3);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiRequestError) {
            if (error.code === "JOIN_REJECTED") {
              resolutionRef.current = "rejected";
              setJoinStatus("rejected");
            } else if (error.code === "UNAUTHORIZED") {
              clearGuestSession();
              setParticipantSession(null);
              setParticipantId("");
              setJoinStatus("idle");
            }
          }
          setJoinError(
            getErrorMessage(error, "No se pudo recuperar el estado de ingreso."),
          );
        });
    });

    socket.connect();
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isDemo, participantSession, sala, sala.id, sala.codigo]);

  // Countdown auto-redirect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      const params = new URLSearchParams({ code, salaId: sala.id });
      if (participantIsHost) params.set("host", "true");
      router.push(`/room?${params.toString()}`);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, code, participantIsHost, router, sala.id]);

  async function handleRequestJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError("");

    if (isDemo) {
      setParticipantId("demo-participant");
      setJoinStatus("waiting");
      window.setTimeout(() => {
        setJoinStatus("approved");
        setCountdown(3);
      }, 1200);
      return;
    }

    setJoinLoading(true);
    try {
      const result = await joinSala(code, isAuthenticated ? {} : joinForm);
      const session = {
        accessToken: result.accessToken,
        participanteId: result.participanteId,
        salaId: result.salaId,
      };
      resolutionRef.current =
        result.estado === "PENDIENTE" ? null : toJoinStatus(result.estado);
      saveGuestSession(session);
      setParticipantId(result.participanteId);
      setParticipantSession(session);
      setJoinStatus(toJoinStatus(result.estado));
      if (result.estado === "APROBADO") setCountdown(3);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "JOIN_REJECTED") {
        resolutionRef.current = "rejected";
        setJoinStatus("rejected");
      }
      setJoinError(getErrorMessage(error, "No se pudo solicitar el ingreso."));
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
      {/* Camera preview */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
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
          <div className="absolute bottom-4 left-4 rounded-full bg-slate-950/75 px-3 py-1.5 text-sm text-white">
            Vista previa local
          </div>
        </div>
        <div className="flex flex-wrap gap-3 p-4">
          <button
            type="button"
            onClick={() => setCameraEnabled((v) => !v)}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {cameraEnabled ? "Apagar cámara" : "Encender cámara"}
          </button>
          <button
            type="button"
            onClick={() => setMicrophoneEnabled((v) => !v)}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {microphoneEnabled ? "Silenciar micrófono" : "Activar micrófono"}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Reunión
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">{sala.nombre}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Código: <strong className="tracking-widest">{sala.codigo}</strong>
        </p>

        {mediaError && (
          <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            {mediaError} Podés continuar sin medios.
          </p>
        )}

        {/* Join form — only shown while idle or rejected */}
        {joinStatus === "idle" && (
          <form id="join-request" onSubmit={handleRequestJoin} className="mt-6 space-y-4">
            {isAuthenticated ? (
              <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                Vas a solicitar el ingreso como {user?.nombre} {user?.apellido}
                {user?.email ? ` (${user.email})` : ""}.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nombre
                    <input
                      required
                      value={joinForm.nombre}
                      onChange={(e) => setJoinForm((f) => ({ ...f, nombre: e.target.value }))}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Apellido
                    <input
                      required
                      value={joinForm.apellido}
                      onChange={(e) => setJoinForm((f) => ({ ...f, apellido: e.target.value }))}
                      className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input
                    required
                    type="email"
                    value={joinForm.email}
                    onChange={(e) => setJoinForm((f) => ({ ...f, email: e.target.value }))}
                    className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                  />
                </label>
              </>
            )}
          </form>
        )}

        {joinError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {joinError}
          </p>
        )}

        {/* Status card */}
        <div
          className={`mt-6 rounded-xl p-4 transition-colors ${
            joinStatus === "approved"
              ? "bg-green-50 ring-1 ring-green-200"
              : joinStatus === "rejected"
                ? "bg-red-50 ring-1 ring-red-200"
                : joinStatus === "waiting"
                  ? "bg-blue-50 ring-1 ring-blue-200"
                  : "bg-slate-50"
          }`}
        >
          <p className="font-semibold text-slate-900">
            {joinStatus === "waiting" && "Esperando aprobación del anfitrión…"}
            {joinStatus === "approved" && "✓ Ingreso aprobado"}
            {joinStatus === "rejected" && "✗ Ingreso rechazado"}
            {joinStatus === "idle" && "Listo para solicitar ingreso"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {joinStatus === "waiting" &&
              "Te avisaremos en tiempo real cuando el anfitrión decida."}
            {joinStatus === "approved" && countdown !== null && (
              <>Redirigiendo a la sala en <strong>{countdown}</strong>…</>
            )}
            {joinStatus === "approved" && countdown === null &&
              "Ya podés continuar a la sala de conferencia."}
            {joinStatus === "rejected" &&
              "El anfitrión rechazó tu solicitud. Contactalo si necesitás acceso."}
            {joinStatus === "idle" &&
              "El anfitrión deberá aprobar tu ingreso antes de entrar."}
          </p>
          {joinStatus === "waiting" && (
            <div className="mt-3 flex justify-center">
              <span className="inline-flex gap-1.5">
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
              </span>
            </div>
          )}
          {participantId && (
            <p className="mt-2 text-xs text-slate-400">ID: {participantId}</p>
          )}
        </div>

        {/* CTA buttons */}
        {joinStatus === "approved" ? (
          <Link
            href={`/room?code=${encodeURIComponent(sala.codigo)}&salaId=${encodeURIComponent(sala.id)}`}
            id="enter-room-btn"
            className="mt-6 inline-flex w-full justify-center rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-700"
          >
            {countdown !== null ? `Entrando en ${countdown}…` : "Continuar a la sala"}
          </Link>
        ) : joinStatus === "waiting" ? (
          <Link
            href="/home"
            className="mt-6 inline-flex w-full justify-center rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
          >
            Salir de la sala de espera
          </Link>
        ) : joinStatus === "idle" ? (
          <button
            type="submit"
            form="join-request"
            id="request-join-btn"
            disabled={joinLoading}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
          >
            {joinLoading ? "Solicitando..." : "Solicitar ingreso"}
          </button>
        ) : null}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host view
// ---------------------------------------------------------------------------
function HostView({ sala, accessToken }: { sala: Sala; accessToken?: string }) {
  const { requests, approve, reject, connected, error } = useHostSocket({
    salaCodigo: sala.codigo,
    salaId: sala.id,
    accessToken,
  });

  const pendingCount = requests.filter(
    (r) => r.status === "pending" || r.status === "approving" || r.status === "rejecting"
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      {/* Host info card */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Anfitrión
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{sala.nombre}</h2>
          <p className="mt-2 text-sm text-slate-600">
            Código:{" "}
            <strong className="font-mono tracking-widest text-slate-950">
              {sala.codigo}
            </strong>
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Compartí este código para que los participantes puedan solicitar ingreso.
            Aparecerán abajo en tiempo real y podrás aprobarlos o rechazarlos.
          </p>
          <Link
            href={`/room?code=${encodeURIComponent(sala.codigo)}&salaId=${encodeURIComponent(sala.id)}&callId=${encodeURIComponent(sala.streamRoomId ?? "")}&host=true`}
            id="host-enter-room-btn"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Entrar a la sala →
          </Link>
        </div>

        {/* Pending badge on mobile */}
        {pendingCount > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 lg:hidden"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              {pendingCount}
            </span>
            <p className="text-sm font-medium text-blue-800">
              {pendingCount === 1
                ? "1 solicitud pendiente de aprobación"
                : `${pendingCount} solicitudes pendientes de aprobación`}
            </p>
          </div>
        )}
      </div>

      {/* Request panel */}
      <HostRequestPanel
        requests={requests}
        connected={connected}
        error={error}
        onApprove={approve}
        onReject={reject}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------
function WaitingRoomContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const isHost = searchParams.get("host") === "true";
  const isDemo = searchParams.get("demo") === "true" || code === "DEMO-123";
  const accessToken = searchParams.get("token") ?? undefined;

  const [sala, setSala] = useState<Sala | null>(null);
  const [loadingSala, setLoadingSala] = useState(true);
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSala() {
      if (!code) {
        setLoadingSala(false);
        setRoomError("Falta el código de la reunión.");
        return;
      }

      if (isDemo) {
        setSala({
          id: "demo-room",
          codigo: code,
          nombre: "Reunión de prueba",
          resumen: "Waiting-room local sin backend",
          fechaInicio: new Date().toISOString(),
          estado: "ACTIVA",
        });
        setLoadingSala(false);
        return;
      }

      setLoadingSala(true);
      setRoomError("");
      setSala(null);

      try {
        const nextSala = await getSalaByCode(code);
        if (!cancelled) setSala(nextSala);
      } catch (error) {
        if (!cancelled)
          setRoomError(getErrorMessage(error, "No se pudo validar la reunión."));
      } finally {
        if (!cancelled) setLoadingSala(false);
      }
    }

    void loadSala();
    return () => { cancelled = true; };
  }, [code, isDemo]);

  const isLoading = loadingSala || !sala;

  return (
    <section aria-labelledby="page-title" className="space-y-8">
      {/* Page header */}
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          {isHost ? "Sala de espera · Anfitrión" : "Waiting room"}
        </p>
        <h1
          id="page-title"
          className="mt-3 text-4xl font-bold tracking-tight text-slate-950"
        >
          {isHost ? "Gestión de accesos" : "Prepará tu ingreso"}
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          {isHost
            ? "Aprobá o rechazá las solicitudes de ingreso de los participantes en tiempo real."
            : "Revisá tu cámara y micrófono antes de solicitar acceso a la reunión."}
        </p>
        {isDemo && (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Modo demo: no se realizan llamadas al backend ni a Socket.io.
          </p>
        )}
      </div>

      {isLoading && !roomError && (
        <p
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600"
        >
          Validando la reunión…
        </p>
      )}

      {roomError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700"
        >
          <p>{roomError}</p>
          <Link href="/home" className="mt-4 inline-flex font-semibold underline">
            Volver al inicio
          </Link>
        </div>
      )}

      {sala && (
        isHost ? (
          <HostView sala={sala} accessToken={accessToken} />
        ) : (
          <ParticipantView sala={sala} code={code} isDemo={isDemo} />
        )
      )}
    </section>
  );
}

export default function WaitingRoomPage() {
  return (
    <Suspense fallback={<section>Cargando waiting room…</section>}>
      <WaitingRoomContent />
    </Suspense>
  );
}
