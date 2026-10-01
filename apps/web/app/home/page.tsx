"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { createSala, getSalaByCode } from "../lib/salas-api";
import { parseJoinInput } from "../lib/join-code";
import { HomeHero } from "../components/home-hero";
import { HomeHeader } from "../components/home-header";
import {
  ScheduleMeetingModal,
  type ImmediateMeetingInput,
  type ScheduleMeetingInput,
} from "../components/schedule-meeting-modal";
import { AuthModal } from "../components/auth-modal";

function roomHostHref(sala: {
  codigo: string;
  id: string;
  streamRoomId?: string | null;
}) {
  return `/room?code=${encodeURIComponent(sala.codigo)}&host=true&salaId=${encodeURIComponent(sala.id)}&callId=${encodeURIComponent(sala.streamRoomId ?? "")}`;
}

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();

  const [meetingMode, setMeetingMode] = useState<"now" | "schedule" | null>(null);
  const [meetingSubmitting, setMeetingSubmitting] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [loginOpen, setLoginOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  function requireAuth(action: () => void) {
    if (isReady && !isAuthenticated) {
      pendingActionRef.current = action;
      setLoginOpen(true);
      return;
    }
    action();
  }

  function rememberOpener() {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function openMeeting(mode: "now" | "schedule") {
    setMeetingError(null);
    setMeetingMode(mode);
  }

  async function handleMeetingSubmit(input: ScheduleMeetingInput | ImmediateMeetingInput) {
    if (meetingSubmitting || !meetingMode) return;
    setMeetingError(null);
    setMeetingSubmitting(true);
    try {
      const sala = await createSala(
        meetingMode === "schedule" && "fechaInicio" in input
          ? {
              nombre: input.nombre,
              resumen: input.resumen,
              fechaInicio: input.fechaInicio,
            }
          : {
              nombre: input.nombre,
              resumen: input.resumen,
            },
      );
      setMeetingMode(null);
      router.push(roomHostHref(sala));
    } catch {
      setMeetingError(
        meetingMode === "now"
          ? "No se pudo crear la reunión. Intentá de nuevo."
          : "No se pudo programar la reunión. Intentá de nuevo.",
      );
    } finally {
      setMeetingSubmitting(false);
    }
  }

  function handleStartNow() {
    rememberOpener();
    requireAuth(() => openMeeting("now"));
  }

  function handleOpenSchedule() {
    rememberOpener();
    requireAuth(() => openMeeting("schedule"));
  }

  function handleMeetingRequest(input: ScheduleMeetingInput | ImmediateMeetingInput) {
    requireAuth(() => {
      void handleMeetingSubmit(input);
    });
  }

  async function handleJoin(rawInput: string) {
    if (joining) return;
    setJoinError(null);

    const codigo = parseJoinInput(rawInput);
    if (!codigo) {
      setJoinError("El código o enlace no es válido.");
      return;
    }

    setJoining(true);
    try {
      const sala = await getSalaByCode(codigo);
      router.push(`/waiting-room?code=${encodeURIComponent(sala.codigo)}`);
    } catch (requestError) {
      setJoinError(
        requestError instanceof Error
          ? requestError.message
          : "El código o enlace no es válido.",
      );
    } finally {
      setJoining(false);
    }
  }

  function handleAuthClose() {
    pendingActionRef.current = null;
    setLoginOpen(false);
  }

  function handleLoginSuccess() {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setLoginOpen(false);
    action?.();
  }

  return (
    <>
      <HomeHero
        header={<HomeHeader />}
        onStartNow={handleStartNow}
        startingNow={meetingSubmitting && meetingMode === "now"}
        onOpenSchedule={handleOpenSchedule}
        onJoin={handleJoin}
        joining={joining}
        joinError={joinError}
      />

      <ScheduleMeetingModal
        mode={meetingMode ?? "schedule"}
        open={meetingMode !== null}
        submitting={meetingSubmitting}
        error={meetingError}
        returnFocusRef={openerRef}
        onClose={() => setMeetingMode(null)}
        onSubmit={handleMeetingRequest}
      />

      <AuthModal
        open={loginOpen}
        onClose={handleAuthClose}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}
