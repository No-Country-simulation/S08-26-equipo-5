"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true" || searchParams.get("code") === "DEMO-123";
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  useEffect(() => {
    if (!isDemo) {
      return;
    }

    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMediaError("No se pudo acceder a la cámara o al micrófono.");
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [isDemo]);

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

  if (!isDemo) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-950">Sala de reunión</h1>
        <p className="mt-4 text-slate-600">
          La sala real requiere la aprobación del backend y un token de GetStream.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Modo demo local
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          Sala de reunión
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Esta vista prueba el preview y los controles sin conectarse al backend.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-sm">
          <div className="relative aspect-video">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
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
              onClick={() => setCameraEnabled((value) => !value)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {cameraEnabled ? "Apagar cámara" : "Encender cámara"}
            </button>
            <button
              type="button"
              onClick={() => setMicrophoneEnabled((value) => !value)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {microphoneEnabled ? "Silenciar micrófono" : "Activar micrófono"}
            </button>
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Participantes</h2>
          <div className="mt-4 space-y-3">
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Vos · conectado</p>
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Host demo · conectado
            </p>
          </div>
          {mediaError && (
            <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {mediaError}
            </p>
          )}
          <Link
            href="/waiting-room?code=DEMO-123&demo=true"
            className="mt-6 inline-flex w-full justify-center rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
          >
            Volver a waiting-room
          </Link>
        </aside>
      </div>
    </section>
  );
}
