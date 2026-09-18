"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type WaitingRoomClientProps = {
  code: string;
};

export function WaitingRoomClient({ code }: WaitingRoomClientProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [mediaError, setMediaError] = useState("");
  const [name, setName] = useState("");
  const [joinStatus, setJoinStatus] = useState<"idle" | "waiting" | "approved">("idle");

  useEffect(() => {
    let cancelled = false;

    async function startPreview() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError("Este navegador no permite acceder a cámara y micrófono.");
        return;
      }

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
            error instanceof Error
              ? error.message
              : "No se pudo acceder a la cámara y al micrófono.",
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
  }, []);

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

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinStatus("waiting");
    window.setTimeout(() => setJoinStatus("approved"), 800);
  }

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
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Modo demo: no se realizan llamadas al backend.
        </p>
      </div>

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
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Reunión de prueba</h2>
          <p className="mt-2 text-sm text-slate-600">
            Código: <strong className="tracking-widest">{code}</strong>
          </p>

          {mediaError && (
            <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {mediaError}
            </p>
          )}

          <form onSubmit={handleJoin} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Tu nombre
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
              />
            </label>
            <button
              type="submit"
              disabled={joinStatus === "waiting"}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {joinStatus === "waiting" ? "Solicitando..." : "Solicitar ingreso"}
            </button>
          </form>

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="font-semibold text-slate-900">
              {joinStatus === "approved"
                ? "Ingreso aprobado"
                : joinStatus === "waiting"
                  ? "Esperando aprobación"
                  : "Listo para solicitar ingreso"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {joinStatus === "approved"
                ? "La prueba de cámara y micrófono está lista."
                : "Podés probar tus dispositivos antes de ingresar."}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}