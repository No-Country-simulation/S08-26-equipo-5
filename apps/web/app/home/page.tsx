"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { createSala, getSalaByCode } from "../lib/salas-api";
import { parseJoinInput } from "../lib/join-code";
import { HomeHero } from "../components/home-hero";
import { ScheduleMeetingModal, type ScheduleMeetingInput } from "../components/schedule-meeting-modal";
import { LoginModal } from "../components/login-modal";

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

  const [startingNow, setStartingNow] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [loginOpen, setLoginOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  function requireAuth(action: () => void) {
    if (isReady && !isAuthenticated) {
      pendingActionRef.current = action;
      setLoginOpen(true);
      return;
    }
    action();
  }

  async function doStartNow() {
    if (startingNow) return;
    setStartError(null);
    setStartingNow(true);
    try {
      const sala = await createSala({
        nombre: "Reunión instantánea",
        fechaInicio: new Date().toISOString(),
      });
      router.push(roomHostHref(sala));
    } catch (requestError) {
      setStartError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo iniciar la reunión.",
      );
      setStartingNow(false);
    }
  }

  async function doScheduleSubmit(input: ScheduleMeetingInput) {
    setScheduleError(null);
    setScheduleSubmitting(true);
    try {
      const sala = await createSala(input);
      setScheduleOpen(false);
      router.push(roomHostHref(sala));
    } catch (requestError) {
      setScheduleError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo programar la reunión.",
      );
    } finally {
      setScheduleSubmitting(false);
    }
  }

  function handleStartNow() {
    requireAuth(doStartNow);
  }

  function handleOpenSchedule() {
    requireAuth(() => {
      setScheduleError(null);
      setScheduleOpen(true);
    });
  }

  function handleScheduleSubmit(input: ScheduleMeetingInput) {
    requireAuth(() => doScheduleSubmit(input));
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

  function handleLoginSuccess() {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }

  return (
    <>
      <HomeHero
        onStartNow={handleStartNow}
        startingNow={startingNow}
        onOpenSchedule={handleOpenSchedule}
        onJoin={handleJoin}
        joining={joining}
        joinError={joinError}
      />

      {startError && (
        <p
          role="alert"
          className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-lg sm:inset-x-auto sm:right-4"
        >
          {startError}
        </p>
      )}

      <ScheduleMeetingModal
        open={scheduleOpen}
        submitting={scheduleSubmitting}
        error={scheduleError}
        onClose={() => setScheduleOpen(false)}
        onSubmit={handleScheduleSubmit}
      />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}
