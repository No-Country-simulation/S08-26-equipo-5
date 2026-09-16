"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  getRealtimeUrl,
  getSalaByCode,
  requestSalaJoin,
  type Sala,
} from "../../lib/salas-api";

type JoinStatus = "idle" | "waiting" | "approved" | "rejected";

type JoinApprovedPayload = {
  sala?: {
    codigo?: string;
  };
  streamCallId?: string | null;
};

type JoinRejectedPayload = {
  sala?: {
    codigo?: string;
  };
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function WaitingRoomPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const isDemo = searchParams.get("demo") === "true" || code === "DEMO-123";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [sala, setSala] = useState<Sala | null>(null);
  const [loadingSala, setLoadingSala] = useState(true);
  const [mediaError, setMediaError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");
  const [participantId, setParticipantId] = useState("");
  const [streamCallId, setStreamCallId] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinForm, setJoinForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
  });

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
      setJoinStatus("idle");

      try {
        const nextSala = await getSalaByCode(code);
        if (!cancelled) {
          setSala(nextSala);
        }
      } catch (error) {
        if (!cancelled) {
          setRoomError(getErrorMessage(error, "No se pudo validar la reunión."));
        }
      } finally {
        if (!cancelled) {
          setLoadingSala(false);
        }
      }
    }

    void loadSala();
    return () => {
      cancelled = true;
    };
  }, [code, isDemo]);

  useEffect(() => {
    let cancelled = false;

    async function startPreview() {
      if (!sala || !navigator.mediaDevices?.getUserMedia) {
        return;
      }

      setMediaError("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        if (!cancelled) {
          setMediaError(
            getErrorMessage(
              error,
              "No se pudo acceder a la cámara y al micrófono.",
            ),
          );
        }
      }
    }

    void startPreview();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [sala]);

  useEffect(() => {
    if (!sala || isDemo) {
      return;
    }

    const socket = io(`${getRealtimeUrl()}/reuniones`, {
      transports: ["websocket"],
      autoConnect: false,
    });
    socketRef.current = socket;

    function belongsToSala(payload: { sala?: { codigo?: string } }) {
      return !payload.sala?.codigo || payload.sala.codigo === sala.codigo;
    }

    socket.on("join:approved", (payload: JoinApprovedPayload) => {
      if (!belongsToSala(payload)) {
        return;
      }
      setStreamCallId(payload.streamCallId ?? "");
      setJoinStatus("approved");
    });
    socket.on("join:rejected", (payload: JoinRejectedPayload) => {
      if (belongsToSala(payload)) {
        setJoinStatus("rejected");
      }
    });
    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sala, isDemo]);

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

  async function handleRequestJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError("");

    if (!code) {
      setJoinError("Falta el código de la reunión.");
      return;
    }

    if (isDemo) {
      setParticipantId("demo-participant");
      setJoinStatus("waiting");
      window.setTimeout(() => {
        setStreamCallId("demo-call");
        setJoinStatus("approved");
      }, 1200);
      return;
    }

    try {
      const response = await requestSalaJoin(code, joinForm);
      setParticipantId(response.participanteId);
      setJoinStatus(response.estado === "RECHAZADO" ? "rejected" : "waiting");
    } catch (error) {
      setJoinError(getErrorMessage(error, "No se pudo solicitar el ingreso."));
    }
  }

  const isLoading = loadingSala || !sala;

  return (
    <section aria-labelledby="page-title" className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Waiting room
        </p>
        <h1 id="page-title" className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Prepará tu ingreso
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Revisá tu cámara y micrófono antes de solicitar acceso a la reunión.
        </p>
        {isDemo && (
          <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Modo demo: no se realizan llamadas al backend ni a Socket.io.
          </p>
        )}
      </div>

      {isLoading && !roomError && (
        <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600">
          Validando la reunión...
        </p>
      )}

      {roomError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          <p>{roomError}</p>
          <Link href="/home" className="mt-4 inline-flex font-semibold underline">
            Volver al inicio
          </Link>
        </div>
      )}

      {sala && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
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
                onClick={() => setCameraEnabled((enabled) => !enabled)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {cameraEnabled ? "Apagar cámara" : "Encender cámara"}
              </button>
              <button
                type="button"
                onClick={() => setMicrophoneEnabled((enabled) => !enabled)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {microphoneEnabled ? "Silenciar micrófono" : "Activar micrófono"}
              </button>
            </div>
          </div>

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

            <form id="join-request" onSubmit={handleRequestJoin} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Nombre
                  <input
                    required
                    value={joinForm.nombre}
                    onChange={(event) =>
                      setJoinForm((form) => ({ ...form, nombre: event.target.value }))
                    }
                    className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Apellido
                  <input
                    required
                    value={joinForm.apellido}
                    onChange={(event) =>
                      setJoinForm((form) => ({ ...form, apellido: event.target.value }))
                    }
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
                  onChange={(event) =>
                    setJoinForm((form) => ({ ...form, email: event.target.value }))
                  }
                  className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                />
              </label>
            </form>

            {joinError && (
              <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {joinError}
              </p>
            )}

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">
                {joinStatus === "waiting" && "Esperando aprobación"}
                {joinStatus === "approved" && "Ingreso aprobado"}
                {joinStatus === "rejected" && "Ingreso rechazado"}
                {joinStatus === "idle" && "Listo para solicitar ingreso"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {joinStatus === "waiting" &&
                  "Avisaremos cuando el anfitrión acepte o rechace tu solicitud."}
                {joinStatus === "approved" &&
                  "Ya podés continuar a la sala de conferencia."}
                {joinStatus === "rejected" &&
                  "El anfitrión rechazó tu solicitud. Podés volver a intentarlo."}
                {joinStatus === "idle" &&
                  "El anfitrión deberá aprobar tu ingreso antes de entrar a la sala."}
              </p>
              {participantId && (
                <p className="mt-2 text-xs text-slate-500">
                  Solicitud: {participantId}
                </p>
              )}
            </div>

            {joinStatus === "approved" ? (
              <Link
                href={`/room?code=${encodeURIComponent(sala.codigo)}${
                  streamCallId ? `&callId=${encodeURIComponent(streamCallId)}` : ""
                }`}
                className="mt-6 inline-flex w-full justify-center rounded-lg bg-green-700 px-4 py-3 font-semibold text-white hover:bg-green-800"
              >
                Continuar a la sala
              </Link>
            ) : joinStatus === "waiting" ? (
              <button
                type="button"
                onClick={() => setJoinStatus("idle")}
                className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
              >
                Cancelar solicitud
              </button>
            ) : (
              <button
                type="submit"
                form="join-request"
                className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700"
              >
                {joinStatus === "rejected"
                  ? "Solicitar ingreso nuevamente"
                  : "Solicitar ingreso"}
              </button>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
