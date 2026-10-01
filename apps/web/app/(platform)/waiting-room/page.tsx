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
        setParticipantSession(null);
        setParticipantIsHost(false);
        setJoinStatus("idle");
        setCountdown(null);
        return;
      }
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
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError("Este navegador no permite acceder a cámara y micrófono.");
        return;
      }
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

  const meetingDate = new Date(sala.fechaInicio);
  const meetingDetails = Number.isNaN(meetingDate.getTime())
    ? sala.resumen
    : `${new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(meetingDate)} · ${new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(meetingDate)} hs`;
  const inputClass = "mt-2 block w-full rounded-[16px] border border-[#252c5d] bg-white px-3.5 py-4 font-normal text-[#1c2452] placeholder:text-[#c5c8d5] focus:border-[#3d4fdb] focus:outline-none focus:ring-2 focus:ring-[#3d4fdb]/15";

  return (
    <section aria-labelledby="participant-page-title" className="mx-auto w-full max-w-[880px] p-5 sm:p-8">
      <header className="mb-3">
        {isDemo && <p className="mb-2 text-xs font-semibold text-[#3d4fdb]">Modo demo</p>}
        <h1 id="participant-page-title" className="text-[26px] font-bold leading-tight text-[#1c2452]">Antes de unirte</h1>
        <h2 className="mt-1 text-base font-semibold text-[#555d7a]">{sala.nombre}</h2>
        <p className="mt-1 text-sm text-[#626982]">{meetingDetails || sala.resumen || `Código de reunión: ${sala.codigo}`}</p>
      </header>

      <div className="relative aspect-video overflow-hidden rounded-[18px] bg-[#434343]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Vista previa de tu cámara"
          className={`h-full w-full object-cover ${cameraEnabled ? "" : "hidden"}`}
        />
        {!cameraEnabled && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/75">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-white">
              {joinForm.nombre.trim().charAt(0).toUpperCase() || user?.nombre?.charAt(0).toUpperCase() || "?"}
            </span>
            <span className="text-sm font-medium">Tu cámara está apagada</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
          <button
            type="button"
            aria-label={microphoneEnabled ? "Silenciar micrófono" : "Activar micrófono"}
            aria-pressed={microphoneEnabled}
            onClick={() => setMicrophoneEnabled((v) => !v)}
            className={`flex h-14 w-14 items-center justify-center rounded-[15px] text-white transition ${microphoneEnabled ? "bg-[#3d4fdb] hover:bg-[#3344c4]" : "bg-[#29304b] hover:bg-[#20263c]"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={cameraEnabled ? "Apagar cámara" : "Encender cámara"}
            aria-pressed={cameraEnabled}
            onClick={() => setCameraEnabled((v) => !v)}
            className={`flex h-14 w-14 items-center justify-center rounded-[15px] text-white transition ${cameraEnabled ? "bg-[#3d4fdb] hover:bg-[#3344c4]" : "bg-[#29304b] hover:bg-[#20263c]"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="6" width="13" height="12" rx="3" />
              <path d="m16 10 5-3v10l-5-3" />
            </svg>
          </button>
        </div>
      </div>

      {mediaError && (
        <p role="alert" className="mt-4 rounded-[14px] border border-amber-200 bg-amber-50 p-3.5 text-sm leading-relaxed text-amber-900">
          {mediaError} Podés continuar sin medios.
        </p>
      )}

      {joinStatus === "idle" && (
        <form id="join-request" onSubmit={handleRequestJoin} className="mt-5">
          {isAuthenticated ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm leading-relaxed text-[#626982]">
                Vas a solicitar el ingreso como <strong className="text-[#1c2452]">{user?.nombre} {user?.apellido}</strong>
                {user?.email ? ` (${user.email})` : ""}.
              </p>
              <button type="submit" id="request-join-btn" disabled={joinLoading} className="shrink-0 rounded-[18px] bg-[#3d4fdb] px-7 py-4 font-bold text-white transition hover:bg-[#3344c4] disabled:cursor-wait disabled:opacity-60">
                {joinLoading ? "Solicitando..." : "Solicitar unirse"}
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.15fr_auto] xl:items-end">
              <label className="block text-sm font-medium text-[#1c2452]">
                Tu nombre*<input required value={joinForm.nombre} onChange={(e) => setJoinForm((f) => ({ ...f, nombre: e.target.value }))} autoComplete="given-name" placeholder="Escribe tu nombre" className={inputClass} />
              </label>
              <label className="block text-sm font-medium text-[#1c2452]">
                Tu apellido*<input required value={joinForm.apellido} onChange={(e) => setJoinForm((f) => ({ ...f, apellido: e.target.value }))} autoComplete="family-name" placeholder="Escribe tu apellido" className={inputClass} />
              </label>
              <label className="block text-sm font-medium text-[#1c2452]">
                Tu mail*<input required type="email" value={joinForm.email} onChange={(e) => setJoinForm((f) => ({ ...f, email: e.target.value }))} autoComplete="email" placeholder="Escribe tu mail" className={inputClass} />
              </label>
              <button type="submit" id="request-join-btn" disabled={joinLoading} className="min-h-[58px] rounded-[18px] bg-[#3d4fdb] px-6 font-bold text-white transition hover:bg-[#3344c4] disabled:cursor-wait disabled:opacity-60">
                {joinLoading ? "Solicitando..." : "Solicitar unirse"}
              </button>
            </div>
          )}
        </form>
      )}

      {joinError && (
        <p role="alert" className="mt-4 rounded-[14px] border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">{joinError}</p>
      )}

      {joinStatus === "waiting" && (
        <div aria-live="polite" className="mt-5 rounded-[16px] border border-[#dfe2ff] bg-[#f5f6ff] p-4">
          <p className="font-bold text-[#1c2452]">
            Esperando aprobación del anfitrión…
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#626982]">
            Te avisaremos en tiempo real cuando el anfitrión decida.
          </p>
          <Link href="/home" className="mt-4 inline-flex rounded-full border border-[#dfe1eb] bg-white px-5 py-2.5 font-bold text-[#1c2452] transition hover:bg-[#f7f7fb]">Salir de la sala de espera</Link>
        </div>
      )}

      {joinStatus === "approved" && (
        <div role="status" aria-live="polite" className="mt-5 text-[#1c2452]">
          <div className="flex items-center gap-2 text-lg font-bold">
            <span>¡Solicitud aceptada!</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-[#f4d94e]">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="m8.5 12 2.3 2.3 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[#626982]">Te estamos conectando a la reunión...</p>
        </div>
      )}

      {joinStatus === "rejected" && (
        <div role="status" aria-live="polite" className="mt-5 flex flex-col gap-4 text-[#1c2452] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-[#e94e5d]">
              <span>No pudiste ingresar</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="m9 9 6 6m0-6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mt-1 text-sm leading-relaxed">El anfitrión rechazó tu solicitud de acceso</p>
          </div>
          <Link href="/home" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-[#e94e5d] px-8 py-2 text-sm font-bold text-[#e94e5d] transition hover:bg-red-50">
            Volver al inicio
          </Link>
        </div>
      )}
    </section>
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
    <section aria-label={sala && !isHost ? "Sala de espera" : undefined} aria-labelledby={sala && !isHost ? undefined : "page-title"} className="space-y-8">
      {/* Page header */}
      {(!sala || isHost) && <div className="max-w-3xl">
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
      </div>}

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
