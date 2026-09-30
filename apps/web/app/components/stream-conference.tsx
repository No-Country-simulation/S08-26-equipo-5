"use client";

import {
  CancelCallButton,
  OwnCapability,
  ReactionsButton,
  RecordCallButton,
  Restricted,
  ScreenShareButton,
  SpeakerLayout,
  SpeakingWhileMutedNotification,
  StreamCall,
  StreamVideo,
  ToggleAudioPublishingButton,
  ToggleVideoPublishingButton,
} from "@stream-io/video-react-sdk";
import { Call, CallingState, StreamVideoClient } from "@stream-io/video-client";
import { useEffect, useState, useRef, useCallback } from "react";
import { StreamChatPanel } from "./stream-chat-panel";
import { transferHost, finalizarSala } from "../lib/salas-api";

type StreamConferenceProps = {
  apiKey: string;
  token: string;
  user: {
    id: string;
    name: string;
  };
  callType: string;
  callId: string;
  salaId?: string;
  isHost?: boolean;
  onLeave?: (error?: Error) => void;
};

// ── Participant type used in the transfer-host modal ──
type CallParticipant = {
  userId: string;
  name: string;
};

// ── Host Leave Modal ──────────────────────────────────────────
function HostLeaveModal({
  participants,
  transferring,
  onEndForEveryone,
  onTransfer,
  onCancel,
}: {
  participants: CallParticipant[];
  transferring: boolean;
  onEndForEveryone: () => void;
  onTransfer: (userId: string) => void;
  onCancel: () => void;
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-950">¿Qué querés hacer?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sos el host de esta reunión. Podés finalizarla para todos o transferir
          el rol a otro participante antes de irte.
        </p>

        {/* ── Option 1: End for everyone ── */}
        <button
          type="button"
          onClick={onEndForEveryone}
          disabled={transferring}
          className="mt-5 flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-left transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
          <div>
            <p className="font-semibold text-red-800">Finalizar para todos</p>
            <p className="text-xs text-red-600">La reunión terminará y todos serán desconectados.</p>
          </div>
        </button>

        {/* ── Option 2: Transfer host ── */}
        {participants.length > 0 && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="font-semibold text-blue-800">Transferir rol de host</p>
            <p className="text-xs text-blue-600">
              Elegí a quién dejarle el control de la reunión. Vos saldrás de la llamada.
            </p>
            <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {participants.map((p) => (
                <li key={p.userId}>
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(p.userId)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                      selectedUserId === p.userId
                        ? "border-blue-500 bg-blue-100 text-blue-900"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate font-medium">{p.name}</span>
                    {selectedUserId === p.userId && (
                      <svg className="ml-auto h-5 w-5 shrink-0 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => selectedUserId && onTransfer(selectedUserId)}
              disabled={!selectedUserId || transferring}
              className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {transferring ? "Transfiriendo…" : "Transferir y salir"}
            </button>
          </div>
        )}

        {participants.length === 0 && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No hay otros participantes en la llamada a quienes transferir el rol.
          </p>
        )}

        {/* ── Cancel ── */}
        <button
          type="button"
          onClick={onCancel}
          disabled={transferring}
          className="mt-4 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export function StreamConference({
  apiKey,
  token,
  user,
  callType,
  callId,
  salaId,
  isHost,
  onLeave,
}: StreamConferenceProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [otherParticipants, setOtherParticipants] = useState<CallParticipant[]>([]);
  const [isStreamHost, setIsStreamHost] = useState(false);

  const effectiveIsHost = Boolean(isHost || isStreamHost);

  // ── Dynamically check if the user is an admin/host in GetStream ──
  useEffect(() => {
    if (!call) return;

    const checkHostStatus = () => {
      const members = call.state.members ?? [];
      const myMember = members.find((m) => m.user_id === user.id);
      const isMemberAdmin = myMember?.role === "admin" || myMember?.role === "host";

      const participants = call.state.participants ?? [];
      const myParticipant = participants.find((p) => p.isLocalParticipant || p.userId === user.id);
      const isParticipantAdmin = myParticipant?.roles?.some((r) => r === "admin" || r === "host");

      setIsStreamHost(Boolean(isMemberAdmin || isParticipantAdmin));
    };

    checkHostStatus();

    const unsubUpdated = call.on("call.updated", checkHostStatus);
    const unsubMemberUpdated = call.on("call.member_updated", checkHostStatus);
    const refreshCallPermissions = () => {
      void call
        .get()
        .then(checkHostStatus)
        .catch((refreshError) => {
          console.error("No se pudieron actualizar los permisos de GetStream", refreshError);
        });
    };
    const unsubMemberPermissionUpdated = call.on(
      "call.member_updated_permission",
      refreshCallPermissions,
    );
    const unsubPermissionsUpdated = call.on("call.permissions_updated", checkHostStatus);
    const unsubJoined = call.on("call.session_participant_joined", checkHostStatus);
    const unsubLeft = call.on("call.session_participant_left", checkHostStatus);

    const interval = setInterval(checkHostStatus, 1500);

    return () => {
      unsubUpdated();
      unsubMemberUpdated();
      unsubMemberPermissionUpdated();
      unsubPermissionsUpdated();
      unsubJoined();
      unsubLeft();
      clearInterval(interval);
    };
  }, [call, user.id]);

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
    const nextCall = nextClient.call(callType, callId);

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
        await nextCall.join({ create: false });
      })
      .then(async () => {
        await nextCall.camera.enable();
        await nextCall.microphone.enable();
        if (active) {
          setClient(nextClient);
          setCall(nextCall);
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
      if (nextCall.state.callingState !== CallingState.LEFT && !isEndingCall) {
        void nextCall.leave();
      }
      void nextClient.disconnectUser();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, callId, callType, token, user.id, user.name]);

  // ── Collect other participants when the modal opens ──
  useEffect(() => {
    if (!showLeaveModal || !call || !salaId) return;

    let active = true;

    // Stream asigna IDs de participante tanto a cuentas como a invitados.
    // Usamos el indicador de cuenta registrada que el servidor guarda en el
    // perfil de Stream y solo ofrecemos destinos que estén en la llamada.
    const members = call.state.members ?? [];
    const registeredIds = new Set(
      members
        .filter((member) => member.user?.custom?.registered === true)
        .map((member) => member.user_id),
    );
    const participants = call.state.participants ?? [];
    const others: CallParticipant[] = participants
      .filter((participant) => !participant.isLocalParticipant)
      .filter((participant) => participant.userId !== user.id)
      .filter((participant) => registeredIds.has(participant.userId))
      .map((participant) => ({
        userId: participant.userId,
        name: participant.name || participant.userId,
      }));

    setOtherParticipants(others);

    return () => {
      active = false;
    };
  }, [showLeaveModal, call, user.id]);

  const handleLeave = useCallback(async () => {
    if (!call) return;
    if (effectiveIsHost) {
      setShowLeaveModal(true);
    } else {
      try {
        await call.leave();
        onLeave?.();
      } catch (err) {
        onLeave?.(err instanceof Error ? err : new Error("Error al salir de la sala"));
      }
    }
  }, [call, effectiveIsHost, onLeave]);

  const endCallForEveryone = useCallback(async () => {
    if (!call || !salaId) return;
    try {
      setIsEndingCall(true);
      await call.endCall();
      // Notificar explícitamente al backend para que finalice la sala
      // (fallback necesario porque el webhook de GetStream puede no llegar en desarrollo local)
      await finalizarSala(salaId);
      setShowLeaveModal(false);
      onLeave?.();
    } catch (err) {
      console.error(err);
      alert("No se pudo finalizar la llamada.");
      setIsEndingCall(false);
    }
  }, [call, salaId, onLeave]);

  const transferHostAndLeave = useCallback(async (nuevoHostId: string) => {
    if (!call || !salaId) return;
    try {
      setTransferring(true);
      // Delegar al backend: actualiza la DB y sincroniza roles en GetStream
      // server-side con API secret (el cliente no tiene permisos para hacerlo).
      await transferHost(salaId, nuevoHostId);

      // El host sale sin finalizar la llamada
      await call.leave();
      setShowLeaveModal(false);
      onLeave?.();
    } catch (err) {
      console.error(err);
      alert("Hubo un error al transferir el rol.");
    } finally {
      setTransferring(false);
    }
  }, [call, salaId, onLeave]);

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
      {!isHost && isStreamHost && (
        <div className="bg-blue-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-inner">
          👑 Ahora sos el host de esta reunión. Podés transferir el rol o finalizarla para todos.
        </div>
      )}
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <div className="stream-conference-layout">
            {/* ── Video area ── */}
            <div className="stream-conference-layout__video">
              <div className="stream-conference-layout__video-inner">
                <SpeakerLayout participantsBarPosition="bottom" />
              </div>
              <div className="stream-conference-layout__controls">
                <div className="str-video__call-controls">
                  <Restricted requiredGrants={[OwnCapability.SEND_AUDIO]}>
                    <SpeakingWhileMutedNotification>
                      <ToggleAudioPublishingButton />
                    </SpeakingWhileMutedNotification>
                  </Restricted>
                  <Restricted requiredGrants={[OwnCapability.SEND_VIDEO]}>
                    <ToggleVideoPublishingButton />
                  </Restricted>
                  <Restricted requiredGrants={[OwnCapability.CREATE_REACTION]}>
                    <ReactionsButton />
                  </Restricted>
                  <Restricted requiredGrants={[OwnCapability.SCREENSHARE]}>
                    <ScreenShareButton />
                  </Restricted>
                  <Restricted
                    requiredGrants={[
                      OwnCapability.START_RECORD_CALL,
                      OwnCapability.STOP_RECORD_CALL,
                    ]}
                  >
                    <RecordCallButton />
                  </Restricted>
                  <CancelCallButton onClick={handleLeave} />
                </div>
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

          {/* ── Host Leave Modal ── */}
          {showLeaveModal && (
            <HostLeaveModal
              participants={otherParticipants}
              transferring={transferring}
              onEndForEveryone={endCallForEveryone}
              onTransfer={transferHostAndLeave}
              onCancel={() => setShowLeaveModal(false)}
            />
          )}
        </StreamCall>
      </StreamVideo>
    </div>
  );
}
