"use client";

import {
  CancelCallButton,
  OwnCapability,
  DefaultParticipantViewUI,
  ReactionsButton,
  RecordCallButton,
  Restricted,
  ParticipantView,
  ParticipantsAudio,
  ScreenShareButton,
  SpeakerLayout,
  SpeakingWhileMutedNotification,
  StreamCall,
  StreamVideo,
  ToggleAudioPublishingButton,
  useParticipantViewContext,
  ToggleVideoPublishingButton,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import { Call, CallingState, hasAudio, hasScreenShare, StreamVideoClient } from "@stream-io/video-client";
import { useEffect, useState, useRef, useCallback } from "react";
import { UserAvatar } from "./ui/avatar";
import { displayName } from "../lib/participant-name";
import { StreamChatPanel } from "./stream-chat-panel";
import { HostRequestPanel } from "./host-request-panel";
import type { JoinRequest } from "../lib/host-socket";
import { transferHost, finalizarSala } from "../lib/salas-api";

const callTranslations = {
  en: {},
  es: {
    Reactions: "Reacciones",
    Mic: "Micrófono",
    Video: "Cámara",
    "Share screen": "Compartir pantalla",
    "Stop Screen Sharing": "Dejar de compartir",
    "You are presenting your screen": "Estás compartiendo tu pantalla",
    "You can now share your screen.": "Ya puedes compartir tu pantalla.",
    "You can no longer share your screen.": "Ya no puedes compartir tu pantalla.",
    "Awaiting for an approval to share screen.": "Esperando permiso para compartir pantalla.",
    "Record call": "Grabar llamada",
    "End recording": "Detener grabación",
    "Are you sure you want end the recording?": "¿Quieres detener la grabación?",
    Cancel: "Cancelar",
    "Waiting for recording to start...": "Esperando que empiece la grabación…",
    "Waiting for recording to stop...": "Esperando que termine la grabación…",
    "Leave call": "Salir de la llamada",
    "End call for all": "Terminar la llamada para todos",
    "You are muted. Unmute to speak.": "Estás silenciado. Activa el micrófono para hablar.",
    "Microphone on": "Micrófono activado",
    "Microphone off": "Micrófono silenciado",
    "Camera on": "Cámara activada",
    "Camera off": "Cámara apagada",
    "You can now speak.": "Ya puedes hablar.",
    "You can no longer speak.": "Ya no puedes hablar.",
    "You can now share your video.": "Ya puedes compartir tu cámara.",
    "You can no longer share your video.": "Ya no puedes compartir tu cámara.",
    "You have no permission to share your audio": "No tienes permiso para usar el micrófono",
    "You have no permission to share your video": "No tienes permiso para usar la cámara",
    Pin: "Fijar",
    Unpin: "Dejar de fijar",
    "Pin for everyone": "Fijar para todos",
    "Unpin for everyone": "Dejar de fijar para todos",
    Block: "Bloquear",
    Kick: "Expulsar",
    "Turn off video": "Apagar cámara",
    "Turn off screen share": "Dejar de compartir pantalla",
    "Mute audio": "Silenciar audio",
    "Mute screen share audio": "Silenciar el audio de la pantalla",
    "Allow audio": "Permitir audio",
    "Allow video": "Permitir cámara",
    "Allow screen sharing": "Permitir compartir pantalla",
    "Disable audio": "Desactivar audio",
    "Disable video": "Desactivar cámara",
    "Disable screen sharing": "Desactivar pantalla compartida",
    Enter: "Entrar en",
    Leave: "Salir de",
    "{{ direction }} fullscreen": "{{ direction }} pantalla completa",
    "{{ direction }} picture-in-picture": "{{ direction }} imagen en imagen",
  },
};

type StreamConferenceProps = {
  apiKey: string;
  token: string;
  user: {
    id: string;
    name: string;
    image?: string | null;
  };
  callType: string;
  callId: string;
  salaId?: string;
  isHost?: boolean;
  requests?: JoinRequest[];
  requestsConnected?: boolean;
  requestsError?: string;
  onApproveRequest?: (participanteId: string) => void;
  onRejectRequest?: (participanteId: string) => void;
  onLeave?: (error?: Error) => void;
};

// ── Participant type used in the transfer-host modal ──
type CallParticipant = {
  userId: string;
  name: string;
};

type RoomParticipant = {
  sessionId: string;
  userId: string;
  name: string;
  image: string | null;
  isLocal: boolean;
  isCallHost: boolean;
  publishingAudio: boolean;
  sharingScreen: boolean;
};

const HOST_UNMUTE_EVENT = "meetflow.host-unmute";

let streamSessionChain: Promise<void> = Promise.resolve();

function enqueueStreamSession(task: () => Promise<void>): Promise<void> {
  const run = streamSessionChain.then(task, task);
  streamSessionChain = run.then(() => undefined, () => undefined);
  return run;
}

function isStreamHostRole(role: string | undefined) {
  return role === "admin" || role === "host";
}

function SharingParticipantUI({ menuPlacement = "bottom-start" }: { menuPlacement?: "bottom-start" | "top-end" }) {
  const { participant } = useParticipantViewContext();
  const sharing = hasScreenShare(participant);
  return (
    <div className={sharing ? "stream-conference-sharing-tile" : "stream-conference-tile-ui"}>
      <DefaultParticipantViewUI menuPlacement={menuPlacement} />
    </div>
  );
}

function SharingParticipantBarUI() {
  return <SharingParticipantUI menuPlacement="top-end" />;
}

function CallStage() {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const sharing = participants.filter((participant) => hasScreenShare(participant));
  const remote = participants.filter((participant) => !participant.isLocalParticipant);

  if (sharing.length < 2) {
    return (
      <SpeakerLayout
        participantsBarPosition="bottom"
        ParticipantViewUISpotlight={SharingParticipantUI}
        ParticipantViewUIBar={SharingParticipantBarUI}
      />
    );
  }

  return (
    <div className="stream-conference-shares">
      <ParticipantsAudio participants={remote} />
      <div className="stream-conference-shares__grid">
        {sharing.map((participant) => (
          <div key={participant.sessionId} className="stream-conference-shares__tile">
            <ParticipantView
              participant={participant}
              trackType="screenShareTrack"
              muteAudio
              ParticipantViewUI={SharingParticipantUI}
            />
          </div>
        ))}
      </div>
      <div className="stream-conference-shares__cameras">
        {participants.map((participant) => (
          <ParticipantView
            key={participant.sessionId}
            participant={participant}
            trackType="videoTrack"
            muteAudio
            ParticipantViewUI={SharingParticipantBarUI}
          />
        ))}
      </div>
    </div>
  );
}

async function enableMicrophoneFromHost(call: Call) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await call.microphone.enable();
      return;
    } catch (cause) {
      if (attempt === 4) {
        console.error("El anfitrión reactivó el micrófono, pero no se pudo publicar el audio", cause);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }
}

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
  requests = [],
  requestsConnected = false,
  requestsError = "",
  onApproveRequest,
  onRejectRequest,
  onLeave,
}: StreamConferenceProps) {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState("");
  const [activeSidebar, setActiveSidebar] = useState<"chat" | "participants" | null>("participants");
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [localCanSendAudio, setLocalCanSendAudio] = useState(true);
  const [audioBusyId, setAudioBusyId] = useState<string | null>(null);
  const [audioActionError, setAudioActionError] = useState("");
  const [requestToast, setRequestToast] = useState<JoinRequest | null>(null);
  const notifiedRequestIdsRef = useRef(new Set<string>());
  const requestToastTimeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [otherParticipants, setOtherParticipants] = useState<CallParticipant[]>([]);
  const [isStreamHost, setIsStreamHost] = useState(false);
  const connectionGenerationRef = useRef(0);

  const effectiveIsHost = Boolean(isHost || isStreamHost);
  const pendingRequestsCount = requests.filter(
    (request) => request.status === "pending" || request.status === "approving" || request.status === "rejecting",
  ).length;

  useEffect(() => {
    const newRequests = requests.filter(
      (request) => request.status === "pending" && !notifiedRequestIdsRef.current.has(request.participanteId),
    );
    if (newRequests.length === 0) return;

    newRequests.forEach((request) => notifiedRequestIdsRef.current.add(request.participanteId));
    setRequestToast(newRequests[newRequests.length - 1]);
    if (requestToastTimeoutRef.current !== null) {
      window.clearTimeout(requestToastTimeoutRef.current);
    }
    requestToastTimeoutRef.current = window.setTimeout(() => {
      setRequestToast(null);
      requestToastTimeoutRef.current = null;
    }, 6000);
  }, [requests]);

  useEffect(() => () => {
    if (requestToastTimeoutRef.current !== null) {
      window.clearTimeout(requestToastTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!call) return;

    const syncParticipants = () => {
      const members = call.state.members ?? [];
      setParticipants((call.state.participants ?? []).map((participant) => {
        const member = members.find((item) => item.user_id === participant.userId);
        const isCallHost = isStreamHostRole(member?.role)
          || participant.roles.some((role) => isStreamHostRole(role));
        return {
          sessionId: participant.sessionId,
          userId: participant.userId,
          name: participant.name || participant.userId,
          image: participant.image || null,
          isLocal: Boolean(participant.isLocalParticipant || participant.userId === user.id),
          isCallHost,
          publishingAudio: hasAudio(participant),
          sharingScreen: hasScreenShare(participant),
        };
      }));
      setLocalCanSendAudio(call.permissionsContext.hasPermission(OwnCapability.SEND_AUDIO));
    };

    syncParticipants();
    const subscription = call.state.participants$.subscribe(() => {
      syncParticipants();
    });
    const unsubJoined = call.on("call.session_participant_joined", syncParticipants);
    const unsubLeft = call.on("call.session_participant_left", syncParticipants);
    const unsubPermissions = call.on("call.permissions_updated", syncParticipants);
    const unsubMember = call.on("call.member_updated", syncParticipants);
    const refresh = window.setInterval(syncParticipants, 1000);
    return () => {
      subscription.unsubscribe();
      unsubJoined();
      unsubLeft();
      unsubPermissions();
      unsubMember();
      window.clearInterval(refresh);
    };
  }, [call, user.id]);

  useEffect(() => {
    if (!call) return;
    const unsub = call.on("custom", (event) => {
      const payload = event.custom;
      if (payload?.type !== HOST_UNMUTE_EVENT || payload.userId !== user.id) return;
      void enableMicrophoneFromHost(call);
    });
    return () => {
      unsub();
    };
  }, [call, user.id]);

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
    const connectionGeneration = ++connectionGenerationRef.current;

    const nextClient = StreamVideoClient.getOrCreateInstance({
      apiKey,
      user: { id: user.id, name: user.name, ...(user.image ? { image: user.image } : {}) },
      token,
    });
    const nextCall = nextClient.call(callType, callId);

    let joined = false;
    let disconnectPromise: Promise<void> | null = null;
    const disconnectClient = () => {
      disconnectPromise ??= nextClient.disconnectUser();
      return disconnectPromise;
    };

    const setupPromise = enqueueStreamSession(async () => {
      if (!active) return;
      await nextClient.connectUser(
        { id: user.id, name: user.name, ...(user.image ? { image: user.image } : {}) },
        token,
      );
      if (!active) {
        await disconnectClient().catch(() => {});
        return;
      }

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
      if (!active) {
        await disconnectClient().catch(() => {});
        return;
      }

      await nextCall.join({ create: false });
      joined = true;
      if (!active) {
        await nextCall.leave().catch(() => {});
        joined = false;
        await disconnectClient().catch(() => {});
        return;
      }

      await nextCall.camera.enable();
      if (!active) {
        await nextCall.leave().catch(() => {});
        joined = false;
        await disconnectClient().catch(() => {});
        return;
      }
      await nextCall.microphone.enable();
      if (!active) {
        await nextCall.leave().catch(() => {});
        joined = false;
        await disconnectClient().catch(() => {});
        return;
      }

      setClient(nextClient);
      setCall(nextCall);
    }).catch(async (joinError: unknown) => {
      if (active) {
        setError(
          joinError instanceof Error
            ? joinError.message
            : "No se pudo conectar a la videollamada.",
        );
      }
      if (joined && nextCall.state.callingState !== CallingState.LEFT) {
        await nextCall.leave().catch(() => {});
        joined = false;
      }
      if (connectionGenerationRef.current === connectionGeneration) {
        await disconnectClient().catch(() => {});
      }
    });

    return () => {
      active = false;
      void enqueueStreamSession(async () => {
        await setupPromise.catch(() => {});
        if (joined && nextCall.state.callingState !== CallingState.LEFT && !isEndingCall) {
          await nextCall.leave().catch(() => {});
          joined = false;
        }
        if (connectionGenerationRef.current === connectionGeneration) {
          await disconnectClient().catch(() => {});
        }
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, callId, callType, token, user.id, user.name]);

  // ── Collect other participants when the modal opens ──
  useEffect(() => {
    if (!showLeaveModal || !call || !salaId) return;

    let active = true;
    setOtherParticipants([]);

    // Stream asigna IDs de participante tanto a cuentas como a invitados.
    // Usamos el indicador de cuenta registrada que el servidor guarda en el
    // perfil de Stream. Refrescamos miembros para no depender de metadatos
    // que pudieron quedar en caché antes de que la cuenta ingresara.
    void call
      .get()
      .then(() => {
        if (!active) return;
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
      })
      .catch((err) => {
        console.error("No se pudo actualizar la lista de participantes de GetStream", err);
      });

    return () => {
      active = false;
    };
  }, [showLeaveModal, call, salaId, user.id]);

  const setRemoteAudio = useCallback(async (userId: string, enabled: boolean) => {
    if (!call) return;
    setAudioBusyId(userId);
    setAudioActionError("");
    try {
      if (enabled) {
        await call.grantPermissions(userId, [OwnCapability.SEND_AUDIO]);
        await call.sendCustomEvent({ type: HOST_UNMUTE_EVENT, userId });
      } else {
        await call.revokePermissions(userId, [OwnCapability.SEND_AUDIO]);
      }
    } catch (cause) {
      setAudioActionError(cause instanceof Error ? cause.message : "No se pudo cambiar el micrófono.");
    } finally {
      setAudioBusyId(null);
    }
  }, [call]);

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
      <p role="alert" className="stream-conference-error">
        El identificador de la llamada de GetStream no es válido.
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="stream-conference-error">
        {error}
      </p>
    );
  }

  if (!client) {
    return (
      <div role="status" className="stream-conference-loading">
        <span className="room-loading-spinner" aria-hidden="true" />
        <span>Conectando a la sala…</span>
      </div>
    );
  }

  if (!call) {
    return (
      <div role="status" className="stream-conference-loading">
        <span className="room-loading-spinner" aria-hidden="true" />
        <span>Preparando la sala…</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="str-video stream-conference-shell overflow-hidden bg-[#080b19] text-white">
      {requestToast && (
        <div className="stream-conference-request-toast" role="status" aria-live="polite">
          <span className="stream-conference-request-toast__dot" aria-hidden="true" />
          <UserAvatar name={displayName(requestToast)} src={requestToast.fotoUrl} size="xs" decorative />
          <p><strong>{displayName(requestToast)}</strong> se quiere unir</p>
          <button
            type="button"
            onClick={() => {
              setActiveSidebar("participants");
              setRequestToast(null);
            }}
          >
            Ver solicitudes
          </button>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setRequestToast(null)}>×</button>
        </div>
      )}
      {!isHost && isStreamHost && (
        <div className="bg-blue-600 px-4 py-2 text-center text-xs font-semibold text-white shadow-inner">
          👑 Ahora sos el host de esta reunión. Podés transferir el rol o finalizarla para todos.
        </div>
      )}
      <StreamVideo client={client} language="es" fallbackLanguage="en" translationsOverrides={callTranslations}>
        <StreamCall call={call}>
          <div className="stream-conference-layout">
            {/* ── Video area ── */}
            <div className="stream-conference-layout__video">
              <div className="stream-conference-layout__video-inner">
                <CallStage />
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
                {!localCanSendAudio && !effectiveIsHost && (
                  <p className="stream-conference-layout__muted-note" role="status">El anfitrión silenció tu micrófono.</p>
                )}

              </div>
            </div>

            {/* ── Chat sidebar ── */}
            {activeSidebar && (
              <aside className="stream-conference-layout__chat stream-conference-sidebar" aria-label={activeSidebar === "chat" ? "Chat de la reunión" : "Participantes de la reunión"}>
                <div className="stream-conference-sidebar__header">
                  <h2>{activeSidebar === "chat" ? "Chat" : `Participantes (${participants.length})`}</h2>
                  <button type="button" onClick={() => setActiveSidebar(null)} aria-label="Cerrar panel">×</button>
                </div>
                {activeSidebar === "chat" ? (
                  <StreamChatPanel apiKey={apiKey} token={token} user={user} channelId={callId} />
                ) : (
                  <div className="stream-conference-sidebar__content">
                    {isHost && (
                      <section className="stream-conference-sidebar__section">
                        <h3>Solicitudes de ingreso</h3>
                        {onApproveRequest && onRejectRequest ? (
                          <HostRequestPanel requests={requests} connected={requestsConnected} error={requestsError} onApprove={onApproveRequest} onReject={onRejectRequest} embedded />
                        ) : <p className="stream-conference-sidebar__muted">No hay solicitudes disponibles.</p>}
                      </section>
                    )}
                    <section className="stream-conference-sidebar__section">
                      <h3>Participantes conectados</h3>
                      {audioActionError && <p role="alert" className="stream-conference-sidebar__muted">{audioActionError}</p>}
                      <ul className="stream-conference-sidebar__participants">
                        {participants.map((participant) => {
                          const showAsHost = participant.isCallHost || (participant.isLocal && effectiveIsHost);
                          return (
                          <li key={participant.sessionId}>
                            <UserAvatar name={participant.name} src={participant.image} decorative className="stream-conference-sidebar__avatar" />
                            <span className={`stream-conference-sidebar__participant-name${participant.sharingScreen ? " stream-conference-sidebar__participant-name--sharing" : ""}`}>{participant.name}{participant.isLocal ? " (Vos)" : ""}</span>
                            {participant.sharingScreen && (
                              <span className="stream-conference-sidebar__live" role="img" title="Está compartiendo pantalla" aria-label="Está compartiendo pantalla" />
                            )}
                            <span className={`stream-conference-sidebar__role${showAsHost ? " stream-conference-sidebar__role--host" : ""}`}>{showAsHost ? "Anfitrión" : "Participante"}</span>
                            {effectiveIsHost && !participant.isLocal && (
                              <button
                                type="button"
                                className="stream-conference-sidebar__audio"
                                disabled={audioBusyId === participant.userId}
                                onClick={() => void setRemoteAudio(participant.userId, !participant.publishingAudio)}
                              >
                                {participant.publishingAudio ? "Silenciar" : "Activar micrófono"}
                              </button>
                            )}
                          </li>
                          );
                        })}
                        {participants.length === 0 && <li className="stream-conference-sidebar__muted">Esperando a otros participantes…</li>}
                      </ul>
                    </section>
                  </div>
                )}
              </aside>
            )}
          </div>

          <div className="stream-conference-layout__panel-actions">
            <button
              type="button"
              id="toggle-chat-btn"
              onClick={() => setActiveSidebar((current) => current === "chat" ? null : "chat")}
              className="stream-conference-layout__chat-toggle"
              aria-label={activeSidebar === "chat" ? "Cerrar chat" : "Abrir chat"}
              aria-pressed={activeSidebar === "chat"}
              title={activeSidebar === "chat" ? "Cerrar chat" : "Abrir chat"}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <span>Chat</span>
            </button>
            <button
              type="button"
              id="toggle-participants-btn"
              onClick={() => setActiveSidebar((current) => current === "participants" ? null : "participants")}
              className="stream-conference-layout__chat-toggle"
              aria-label={`${activeSidebar === "participants" ? "Cerrar participantes" : "Abrir participantes"}${pendingRequestsCount > 0 ? `, ${pendingRequestsCount} solicitudes de ingreso` : ""}`}
              aria-pressed={activeSidebar === "participants"}
              title="Participantes y solicitudes"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m16 0v-2a4 4 0 0 0-3-3.87M14 3.13a4 4 0 0 1 0 7.75M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /></svg>
              <span>Participantes</span>
              {pendingRequestsCount > 0 && <span className="stream-conference-request-badge" aria-hidden="true">{pendingRequestsCount}</span>}
            </button>
            <button
              type="button"
              id="toggle-fullscreen-btn"
              onClick={toggleFullscreen}
              className="stream-conference-layout__chat-toggle"
              aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              )}
            </button>
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
