"use client";

import { FormEvent, type ReactNode, useState } from "react";

export type HomeHeroProps = {
  header: ReactNode;
  onStartNow: () => void;
  startingNow: boolean;
  onOpenSchedule: () => void;
  onJoin: (rawInput: string) => void;
  joining: boolean;
  joinError: string | null;
};

function MeetingOptionCard({
  title,
  description,
  buttonLabel,
  loadingLabel,
  onClick,
  loading,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  loadingLabel?: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex w-full max-w-[208px] flex-col items-start rounded-[22px] border-2 border-[#f4e28a] bg-white p-5 shadow-[0_4px_14px_rgba(28,36,82,0.08)]">
      <p className="text-base font-semibold text-[#1c2452]">{title}</p>
      <p className="mt-1 text-sm leading-snug text-slate-500">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading || undefined}
        className="mt-4 inline-flex items-center justify-center rounded-full bg-[#3d4fdb] px-4 py-2.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2452] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? loadingLabel ?? buttonLabel : buttonLabel}
      </button>
    </div>
  );
}

function JoinByCodeForm({
  onJoin,
  joining,
  error,
}: {
  onJoin: (rawInput: string) => void;
  joining: boolean;
  error: string | null;
}) {
  const [value, setValue] = useState("");
  const hasValue = value.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasValue || joining) return;
    onJoin(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 w-full max-w-[300px]">
      <label htmlFor="join-code-input" className="sr-only">
        Código de reunión
      </label>
      <div className="flex items-center gap-1.5 rounded-[16px] bg-white p-1.5 shadow-[0_4px_14px_rgba(28,36,82,0.08)]">
        <input
          id="join-code-input"
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Código de reunión"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-[12px] bg-transparent px-3 py-2 text-sm text-[#1c2452] placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3d4fdb]"
        />
        <button
          type="submit"
          disabled={!hasValue || joining}
          aria-busy={joining || undefined}
          className={`shrink-0 rounded-full px-4 py-2.5 text-[12px] font-bold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1c2452] ${
            hasValue && !joining
              ? "bg-[#3d4fdb] hover:opacity-90"
              : "cursor-not-allowed bg-[#d3d6e0] text-white/80"
          }`}
        >
          {joining ? "Uniendo…" : "Unirme"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

export function HomeHero({
  header,
  onStartNow,
  startingNow,
  onOpenSchedule,
  onJoin,
  joining,
  joinError,
}: HomeHeroProps) {
  return (
    <div className="flex min-h-screen flex-col bg-[#3d4fdb]">
      {header}

      <div className="mx-3.5 flex flex-1 flex-col items-center justify-center rounded-t-[28px] bg-[#f3f4f8] px-5 py-12 sm:px-8">
        <h1 className="max-w-md text-center text-[30px] font-bold leading-tight text-[#1c2452]">
          ¿Cómo quieres reunirte hoy?
        </h1>

        <div className="mt-8 flex w-full max-w-md flex-col items-center gap-[18px] sm:flex-row sm:justify-center">
          <MeetingOptionCard
            title="Reunión inmediata"
            description="Inicia una sala y comparte el enlace"
            buttonLabel="Iniciar ahora"
            loadingLabel="Iniciando…"
            onClick={onStartNow}
            loading={startingNow}
          />
          <MeetingOptionCard
            title="Programar reunión"
            description="Escoge una fecha y configura la sesión"
            buttonLabel="Programar"
            onClick={onOpenSchedule}
          />
        </div>

        <section aria-labelledby="join-heading" className="mt-10 flex w-full flex-col items-center">
          <h2 id="join-heading" className="text-[17px] font-semibold text-[#1c2452]">
            ¿Ya tienes invitación?
          </h2>
          <JoinByCodeForm onJoin={onJoin} joining={joining} error={joinError} />
        </section>
      </div>
    </div>
  );
}
