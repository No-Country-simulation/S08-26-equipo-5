"use client";

import {
  CancelCallButton,
  OwnCapability,
  DefaultParticipantViewUI,
  ReactionsButton,
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
import { transferHost, promoteHost, finalizarSala, getParticipantes } from "../lib/salas-api";
import { downloadRecording, LocalCallRecorder, type RecordingMode } from "../lib/local-call-recorder";
import {
  otherSessionHoldsSameMic,
  readSelectedMicLabel,
  type MicClaim,
} from "../lib/mic-lock";

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
  onBecameHost?: () => void;
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
const MIC_CLAIM_EVENT = "meetflow.mic-claim";
const MIC_LOCK_MESSAGE = "Ese micrófono ya está abierto en otro navegador de esta cuenta.";
const RECORDING_STATUS: Record<RecordingMode, string> = {
  meeting: "Grabando la reunión, con video y audio. Al detener, se descarga el archivo.",
  audio: "Grabando solo audio. Al detener, se descarga el archivo.",
  video: "Grabando solo video. Al detener, se descarga el archivo.",
};

const CAMERA_PERMISSION_MESSAGE =
  "El navegador bloqueó el permiso de tu cámara. Desbloqueala desde el candado (o ícono de permisos) de la barra de direcciones, elegí tu webcam en Cámara → Permitir y volvé a activar el botón de cámara.";
const CAMERA_BUSY_MESSAGE =
  "La cámara aparece en el sistema, pero el navegador no pudo abrirla. En Linux suele quedar ocupada si otra aplicación (otro navegador u OBS) la está usando; cerrala y volvé a activar el botón de cámara.";
const CAMERA_PUBLISH_PERMISSION_MESSAGE =
  "No tenés permiso para publicar tu cámara en esta llamada. El anfitrión debe otorgarte el permiso de video.";
// Stream elige el deviceId persistido en localStorage (o "default"); en Linux el
// id de la webcam cambia entre sesiones (USB) y puede caer en una cámara
// virtual (v4l2loopback/OBS). Si el dispositivo seleccionado no existe o es
// virtual, elegimos la primera webcam real antes de enable(). enumerateDevices
// no abre el dispositivo, así que esto no ocupa la webcam en PipeWire.
const VIRTUAL_CAMERA_PATTERN = /virtual|loopback|obs|droidcam|manycam|snap/i;

function errorNameOf(cause: unknown): string {
  if (cause instanceof DOMException) return cause.name;
  if (cause instanceof Error) return cause.name;
  return "";
}

function isPermissionErrorName(name: string): boolean {
  return name === "NotAllowedError" || name === "SecurityError";
}

function isBusyErrorName(name: string): boolean {
  return name === "NotReadableError" || name === "TrackStartError" || name === "AbortError";
}

function isPublishPermissionError(cause: unknown): boolean {
  return cause instanceof Error && /No permission to publish/i.test(cause.message);
}

async function selectRealCamera(call: Call): Promise<void> {
  const cameras = await navigator.mediaDevices?.enumerateDevices?.()
    .then((devices) => devices.filter((device) => device.kind === "videoinput" && device.label !== ""))
    .catch(() => []);
  if (!cameras || cameras.length === 0) return;

  const selected = call.camera.state.selectedDevice;
  const selectedDevice = selected ? cameras.find((device) => device.deviceId === selected) : undefined;
  if (selectedDevice && !VIRTUAL_CAMERA_PATTERN.test(selectedDevice.label)) return;

  const real = cameras.find((device) => !VIRTUAL_CAMERA_PATTERN.test(device.label));
  if (!real || real.deviceId === selected) return;
  // select() antes de enable() solo guarda el deviceId: no abre la cámara.
  await call.camera.select(real.deviceId).catch(() => undefined);
}

async function enableLocalCamera(call: Call): Promise<string> {
  await selectRealCamera(call);

  let lastError: unknown;
  let lastErrorName = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await call.camera.enable();
      return "";
    } catch (cause) {
      lastError = cause;
      lastErrorName = errorNameOf(cause);
      await call.camera.disable().catch(() => undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
  }

  const cameras = await navigator.mediaDevices?.enumerateDevices?.()
    .then((devices) => devices.filter((device) => device.kind === "videoinput"))
    .catch(() => []);
  console.error("No se pudo abrir la cámara local", {
    error: lastError,
    name: lastErrorName,
    cameras: (cameras ?? []).map((device) => ({ deviceId: device.deviceId, label: device.label })),
  });
  if (isPermissionErrorName(lastErrorName)) {
    return CAMERA_PERMISSION_MESSAGE;
  }
  if (isPublishPermissionError(lastError)) {
    return CAMERA_PUBLISH_PERMISSION_MESSAGE;
  }
  if (!cameras || cameras.length === 0) {
    return "Este navegador no ve tu cámara. En Nobara, permití la cámara en el navegador y revisá que PipeWire la esté mostrando. Las cámaras de los demás no dependen de la tuya.";
  }
  if (isBusyErrorName(lastErrorName)) {
    return CAMERA_BUSY_MESSAGE;
  }
  return "La cámara aparece en el sistema, pero el navegador no pudo abrirla. En Linux suele quedar ocupada si otra aplicación la está usando.";
}

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

  if (sharing.length === 0) {
    return (
      <SpeakerLayout
        participantsBarPosition="bottom"
        ParticipantViewUISpotlight={SharingParticipantUI}
        ParticipantViewUIBar={SharingParticipantBarUI}
      />
    );
  }

  return (
    <div className={`stream-conference-shares${sharing.length === 1 ? " stream-conference-shares--single" : ""}`}>
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
    </div>
  );
}

function ShareSidebarSync({ onShareCount }: { onShareCount: (count: number) => void }) {
  const { useParticipants } = useCallStateHooks();
  const participants = useParticipants();
  const count = participants.filter((participant) => hasScreenShare(participant)).length;

  useEffect(() => {
    onShareCount(count);
  }, [count, onShareCount]);

  return null;
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
  listError = "",
}: {
  participants: CallParticipant[];
  transferring: boolean;
  onEndForEveryone: () => void;
  onTransfer: (userId: string) => void;
  onCancel: () => void;
  listError?: string;
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

        {listError && (
          <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {listError}
          </p>
        )}

        {participants.length === 0 && !listError && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            No hay otra cuenta en la llamada para dejarle el rol. Quien entró como invitado no puede ser anfitrión.
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
  onBecameHost,
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
  const [leaveListError, setLeaveListError] = useState("");
  const [promotableIds, setPromotableIds] = useState<Set<string>>(new Set());
  const [hostBusyId, setHostBusyId] = useState<string | null>(null);
  const [isStreamHost, setIsStreamHost] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [recordMenuOpen, setRecordMenuOpen] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [cameraNotice, setCameraNotice] = useState("");
  const [micLockMessage, setMicLockMessage] = useState("");
  const micClaimsRef = useRef<Map<string, MicClaim>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<LocalCallRecorder | null>(null);
  const shareCountRef = useRef(0);
  const connectionGenerationRef = useRef(0);

  const effectiveIsHost = Boolean(isHost || isStreamHost);

  useEffect(() => {
    if (!isStreamHost || isHost) return;
    onBecameHost?.();
  }, [isHost, isStreamHost, onBecameHost]);
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

  useEffect(() => {
    if (!call) return;
    const microphone = call.microphone;
    const originalEnable = microphone.enable.bind(microphone);
    const originalToggle = microphone.toggle.bind(microphone);
    let since = 0;
    let checking = false;

    const sameAccountSessions = () => (call.state.participants ?? [])
      .filter((participant) => participant.userId === user.id && !participant.isLocalParticipant)
      .map((participant) => ({
        sessionId: participant.sessionId,
        publishingAudio: hasAudio(participant),
      }));

    const holdsSameMic = async () => {
      const label = await readSelectedMicLabel(microphone.state.selectedDevice);
      return otherSessionHoldsSameMic(
        sameAccountSessions(),
        call.state.localParticipant?.sessionId,
        label,
        micClaimsRef.current,
      );
    };

    const publishClaim = async (active: boolean) => {
      const sessionId = call.state.localParticipant?.sessionId;
      if (!sessionId) return;
      const label = await readSelectedMicLabel(microphone.state.selectedDevice);
      await call.sendCustomEvent({
        type: MIC_CLAIM_EVENT,
        userId: user.id,
        sessionId,
        label,
        active,
        since,
      }).catch(() => undefined);
    };

    const patchedEnable = async () => {
      if (await holdsSameMic()) {
        setMicLockMessage(MIC_LOCK_MESSAGE);
        if (microphone.state.status === "enabled") {
          await microphone.disable();
        }
        return;
      }
      await originalEnable();
      if (!since) since = Date.now();
      setMicLockMessage("");
      await publishClaim(true);
    };

    microphone.enable = patchedEnable as typeof microphone.enable;
    microphone.toggle = (async () => {
      if (microphone.state.status === "enabled") {
        await microphone.disable();
        since = 0;
        setMicLockMessage("");
        await publishClaim(false);
        return;
      }
      await patchedEnable();
    }) as typeof microphone.toggle;

    const unsubCustom = call.on("custom", (event) => {
      const payload = event.custom;
      if (!payload || payload.type !== MIC_CLAIM_EVENT || payload.userId !== user.id) return;
      if (typeof payload.sessionId !== "string") return;
      micClaimsRef.current.set(payload.sessionId, {
        sessionId: payload.sessionId,
        label: typeof payload.label === "string" ? payload.label : "",
        active: payload.active !== false,
        since: typeof payload.since === "number" ? payload.since : 0,
      });
      if (microphone.state.status !== "enabled" || checking) return;
      checking = true;
      void holdsSameMic()
        .then(async (blocked) => {
          if (!blocked) return;
          const claimSince = [...micClaimsRef.current.values()]
            .filter((claim) => claim.active && claim.sessionId !== call.state.localParticipant?.sessionId)
            .map((claim) => claim.since)
            .filter((value) => value > 0);
          const earliestOther = claimSince.length > 0 ? Math.min(...claimSince) : 0;
          if (since > 0 && (earliestOther === 0 || since <= earliestOther)) return;
          await microphone.disable();
          since = 0;
          setMicLockMessage(MIC_LOCK_MESSAGE);
          await publishClaim(false);
        })
        .finally(() => {
          checking = false;
        });
    });

    const statusSub = microphone.state.status$.subscribe((status) => {
      if (status !== "enabled" || checking) return;
      checking = true;
      void holdsSameMic()
        .then(async (blocked) => {
          if (blocked) {
            await microphone.disable();
            since = 0;
            setMicLockMessage(MIC_LOCK_MESSAGE);
            return;
          }
          if (!since) since = Date.now();
          await publishClaim(true);
        })
        .finally(() => {
          checking = false;
        });
    });

    return () => {
      microphone.enable = originalEnable;
      microphone.toggle = originalToggle;
      unsubCustom();
      statusSub.unsubscribe();
    };
  }, [call, user.id]);

  // El SDK solo pide el permiso de cámara una vez por enable(); si el navegador
  // lo denegó, no vuelve a preguntar: avisamos con el motivo concreto sin
  // impedir que el usuario siga en la llamada.
  useEffect(() => {
    if (!call) return;
    const permissionSub = call.camera.state.browserPermissionState$.subscribe((state) => {
      if (state !== "denied") return;
      if (call.camera.state.status === "enabled") return;
      setCameraNotice(CAMERA_PERMISSION_MESSAGE);
    });
    return () => {
      permissionSub.unsubscribe();
    };
  }, [call]);

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

      await nextCall.join({ create: false });
      joined = true;
      if (!active) {
        await nextCall.leave().catch(() => {});
        joined = false;
        await disconnectClient().catch(() => {});
        return;
      }

      // Una sola apertura. En Linux (PipeWire) un intento previo deja la
      // webcam ocupada y el segundo falla, aunque las cámaras ajenas se vean.
      const cameraMessage = await enableLocalCamera(nextCall);
      if (active) setCameraNotice(cameraMessage);
      if (!active) {
        await nextCall.leave().catch(() => {});
        joined = false;
        await disconnectClient().catch(() => {});
        return;
      }
      try {
        await nextCall.microphone.enable();
      } catch {
        await nextCall.microphone.disable().catch(() => {});
      }
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
    if (!salaId || !effectiveIsHost) return;
    let active = true;
    void getParticipantes(salaId)
      .then((roster) => {
        if (!active) return;
        setPromotableIds(new Set(
          roster.participantes
            .filter((person) => person.puedeSerHost && person.rol !== "HOST")
            .map((person) => person.id),
        ));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [salaId, effectiveIsHost, participants.length]);

  useEffect(() => {
    if (!showLeaveModal || !call || !salaId) return;

    let active = true;
    setOtherParticipants([]);
    setLeaveListError("");

    void Promise.all([call.get().catch(() => undefined), getParticipantes(salaId)])
      .then(([, roster]) => {
        if (!active) return;
        const eligible = new Set(
          roster.participantes
            .filter((person) => person.puedeSerHost)
            .map((person) => person.id),
        );
        const inCall = call.state.participants ?? [];
        setOtherParticipants(
          inCall
            .filter((participant) => !participant.isLocalParticipant)
            .filter((participant) => participant.userId !== user.id)
            .filter((participant) => eligible.has(participant.userId))
            .map((participant) => ({
              userId: participant.userId,
              name: participant.name || participant.userId,
            })),
        );
      })
      .catch((err) => {
        if (!active) return;
        setLeaveListError(err instanceof Error ? err.message : "No se pudo cargar a quién dejar el rol.");
      });

    return () => {
      active = false;
    };
  }, [showLeaveModal, call, salaId, user.id]);

  const handleShareCount = useCallback((count: number) => {
    if (shareCountRef.current === 0 && count > 0) {
      setActiveSidebar((current) => current ?? "chat");
    }
    shareCountRef.current = count;
  }, []);

  const toggleRecording = useCallback(async (mode?: RecordingMode) => {
    if (!call || !stageRef.current) return;
    setRecordingError("");
    setRecordMenuOpen(false);
    if (recorderRef.current) {
      const recorder = recorderRef.current;
      const savedMode = recorder.recordingMode;
      recorderRef.current = null;
      setRecording(false);
      setRecordingMode(null);
      try {
        downloadRecording(await recorder.stop(), savedMode);
      } catch (cause) {
        setRecordingError(cause instanceof Error ? cause.message : "No se pudo guardar la grabación.");
      }
      return;
    }
    if (!mode) return;

    const audioStreams = call.state.participants.flatMap((participant) => (
      [participant.audioStream, participant.screenShareAudioStream].filter((stream): stream is MediaStream => Boolean(stream))
    ));
    const recorder = new LocalCallRecorder();
    try {
      await recorder.start(stageRef.current, audioStreams, mode);
      recorderRef.current = recorder;
      setRecordingMode(mode);
      setRecording(true);
    } catch (cause) {
      setRecordingError(cause instanceof Error ? cause.message : "No se pudo empezar a grabar.");
    }
  }, [call]);

  useEffect(() => () => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
      if (recorder) {
      void recorder.stop().then((blob) => downloadRecording(blob, recorder.recordingMode)).catch(() => undefined);
    }
  }, []);

  const assignCoHost = useCallback(async (userId: string) => {
    if (!call || !salaId) return;
    setHostBusyId(userId);
    setAudioActionError("");
    try {
      await promoteHost(salaId, userId);
      setPromotableIds((current) => {
        const next = new Set(current);
        next.delete(userId);
        return next;
      });
      await call.get().catch(() => undefined);
    } catch (cause) {
      setAudioActionError(cause instanceof Error ? cause.message : "No se pudo asignar el anfitrión.");
    } finally {
      setHostBusyId(null);
    }
  }, [call, salaId]);

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
          <ShareSidebarSync onShareCount={handleShareCount} />
          <div className="stream-conference-layout">
            {/* ── Video area ── */}
            <div className="stream-conference-layout__video">
              <div ref={stageRef} className="stream-conference-layout__video-inner">
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
                  {effectiveIsHost && (
                    <div className="stream-conference-record-wrap">
                      <button
                        type="button"
                        className={`stream-conference-record${recording ? " stream-conference-record--live" : ""}`}
                        aria-pressed={recording}
                        aria-expanded={recordMenuOpen}
                        aria-haspopup="menu"
                        aria-label={recording ? "Detener y descargar" : "Opciones de grabación"}
                        title={recording ? "Detener y descargar" : "Grabar"}
                        onClick={() => {
                          if (recording) {
                            void toggleRecording();
                            return;
                          }
                          setRecordMenuOpen((open) => !open);
                        }}
                      >
                        <span className="stream-conference-record__dot" aria-hidden="true" />
                      </button>
                      {recordMenuOpen && !recording && (
                        <div className="stream-conference-record-menu" role="menu">
                          <button type="button" role="menuitem" onClick={() => void toggleRecording("meeting")}>Grabar reunión</button>
                          <button type="button" role="menuitem" onClick={() => void toggleRecording("audio")}>Grabar audio</button>
                          <button type="button" role="menuitem" onClick={() => void toggleRecording("video")}>Grabar video</button>
                        </div>
                      )}
                    </div>
                  )}
                  <CancelCallButton onClick={handleLeave} />
                </div>
                {!localCanSendAudio && !effectiveIsHost && (
                  <p className="stream-conference-layout__muted-note" role="status">El anfitrión silenció tu micrófono.</p>
                )}
                {recording && recordingMode && <p className="stream-conference-layout__muted-note" role="status">{RECORDING_STATUS[recordingMode]}</p>}
                {recordingError && <p className="stream-conference-layout__muted-note" role="alert">{recordingError}</p>}
                {cameraNotice && <p className="stream-conference-layout__muted-note" role="status">{cameraNotice}</p>}
                {micLockMessage && <p className="stream-conference-layout__muted-note" role="status">{micLockMessage}</p>}

              </div>
            </div>

            {/* ── Chat sidebar ── */}
            {activeSidebar && (
              <aside className="stream-conference-layout__chat stream-conference-sidebar" aria-label={activeSidebar === "chat" ? "Chat de la reunión" : "Participantes de la reunión"}>
                <div className="stream-conference-sidebar__header">
                  <div className="stream-conference-sidebar__switch" role="tablist" aria-label="Panel de la reunión">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeSidebar === "chat"}
                      onClick={() => setActiveSidebar("chat")}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeSidebar === "participants"}
                      onClick={() => setActiveSidebar("participants")}
                    >
                      Participantes
                    </button>
                  </div>
                  <button type="button" className="stream-conference-sidebar__close" onClick={() => setActiveSidebar(null)} aria-label="Cerrar panel">×</button>
                </div>
                {activeSidebar === "chat" ? (
                  <StreamChatPanel apiKey={apiKey} token={token} user={user} channelId={callId} />
                ) : (
                  <div className="stream-conference-sidebar__content">
                    {effectiveIsHost && (
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
                              <div className="stream-conference-sidebar__actions">
                                {promotableIds.has(participant.userId) && !showAsHost && (
                                  <button
                                    type="button"
                                    className="stream-conference-sidebar__host"
                                    disabled={hostBusyId === participant.userId}
                                    onClick={() => void assignCoHost(participant.userId)}
                                  >
                                    {hostBusyId === participant.userId ? "Asignando…" : "Hacer anfitrión"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="stream-conference-sidebar__audio"
                                  disabled={audioBusyId === participant.userId}
                                  aria-label={participant.publishingAudio ? `Silenciar a ${participant.name}` : `Activar el micrófono de ${participant.name}`}
                                  title={participant.publishingAudio ? "Silenciar" : "Activar micrófono"}
                                  onClick={() => void setRemoteAudio(participant.userId, !participant.publishingAudio)}
                                >
                                  {participant.publishingAudio ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                                    </svg>
                                  ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 2l20 20M18.89 13.23A7.12 7.12 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12M12 19v3" />
                                    </svg>
                                  )}
                                </button>
                              </div>
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
              listError={leaveListError}
            />
          )}
        </StreamCall>
      </StreamVideo>
    </div>
  );
}
