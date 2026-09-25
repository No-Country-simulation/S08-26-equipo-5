"use client";

import {
  CallControls,
  SpeakerLayout,
  StreamCall,
  StreamVideo,
} from "@stream-io/video-react-sdk";
import { Call, CallingState, StreamVideoClient } from "@stream-io/video-client";
import { useEffect, useState } from "react";

type StreamConferenceProps = {
  apiKey: string;
  token: string;
  user: {
    id: string;
    name: string;
  };
  callCid: string;
};

export function StreamConference({
  apiKey,
  token,
  user,
  callCid,
}: StreamConferenceProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const [callType, callId] = callCid.split(":");

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
  }, [apiKey, callCid, token, user.id, user.name]);

  if (callCid.split(":").length !== 2) {
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
    <div className="str-video overflow-hidden rounded-2xl bg-slate-950 p-4 shadow-sm">
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <div className="aspect-video min-h-[420px]">
            <SpeakerLayout participantsBarPosition="bottom" />
          </div>
          <div className="mt-4 flex justify-center">
            <CallControls />
          </div>
        </StreamCall>
      </StreamVideo>
    </div>
  );
}
