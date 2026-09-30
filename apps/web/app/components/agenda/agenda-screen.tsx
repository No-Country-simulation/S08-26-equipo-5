"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  findJumpDay,
  formatDayLabel,
  getShareLink,
  meetingsForDay,
  startOfDay,
  TAB_LABELS,
  toMeeting,
  type AgendaTab,
  type Meeting,
} from "../../lib/agenda";
import { getMisParticipaciones } from "../../lib/salas-api";
import { CancelDialog } from "./cancel-dialog";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { MeetingCard } from "./meeting-card";
import { MeetingFormDialog } from "./meeting-form-dialog";
import { SummaryDialog } from "./summary-dialog";
import { btnPrimary, btnSecondary, iconButton } from "./ui";

const TABS: AgendaTab[] = ["proximas", "finalizadas"];

type DialogState =
  | { type: "create" }
  | { type: "edit"; meeting: Meeting }
  | { type: "cancel"; meeting: Meeting }
  | { type: "summary"; meeting: Meeting }
  | null;

type Toast = { id: number; message: string; tone: "success" | "error" } | null;

export function AgendaScreen() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tab, setTab] = useState<AgendaTab>("proximas");
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<Toast>(null);
  // Reloj para habilitar "Unirse" a los participantes 10 min antes (se refresca cada minuto).
  const [now, setNow] = useState(() => Date.now());
  const tabRefs = useRef<Record<AgendaTab, HTMLButtonElement | null>>({
    proximas: null,
    finalizadas: null,
  });
  const requestId = useRef(0);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  /** `silent` refresca sin volver al skeleton (tras crear, editar o cancelar). */
  const load = useCallback(
    async (silent = false) => {
      const current = ++requestId.current;
      if (!silent) setStatus("loading");
      try {
        const { salas } = await getMisParticipaciones();
        if (current !== requestId.current) return;
        setMeetings(salas.map(toMeeting));
        setStatus("ready");
      } catch (error) {
        if (current !== requestId.current) return;
        const message =
          error instanceof Error ? error.message : "No se pudieron cargar tus reuniones.";
        if (silent) {
          showToast(`No se pudo actualizar la lista: ${message}`, "error");
        } else {
          setErrorMessage(message);
          setStatus("error");
        }
      }
    },
    [showToast],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos remotos
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const today = new Date(now);
  const visible = meetingsForDay(meetings, tab, day);
  const jumpDay = findJumpDay(meetings, tab, day);

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.indexOf(tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setTab(TABS[next]);
    tabRefs.current[TABS[next]]?.focus();
  }

  async function copyLink(meeting: Meeting) {
    try {
      await navigator.clipboard.writeText(getShareLink(meeting));
      showToast("Enlace copiado al portapapeles");
    } catch {
      showToast("No se pudo copiar el enlace", "error");
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  const emptyTitle =
    tab === "proximas"
      ? "Aún no tienes reuniones programadas"
      : "Aún no tienes reuniones finalizadas";

  return (
    <section aria-labelledby="agenda-title" className="mx-auto w-full max-w-[1120px] sm:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="agenda-title" className="text-[32px] font-bold leading-10 text-mf-navy">
          Mis reuniones
        </h1>
        <button
          type="button"
          onClick={() => setDialog({ type: "create" })}
          className={`${btnPrimary} h-12 w-full text-base sm:w-auto sm:px-8`}
        >
          + Programar reunión
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Filtrar reuniones"
        className="mt-8 flex gap-8 border-b border-mf-line sm:mt-10"
      >
        {TABS.map((key) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              ref={(element) => {
                tabRefs.current[key] = element;
              }}
              id={`tab-${key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="agenda-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={onTabKeyDown}
              className={`-mb-px border-b-2 px-2.5 pb-3 pt-2 text-base transition-colors focus-visible:rounded-t-md focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-mf-blue focus-visible:shadow-none ${
                selected
                  ? "border-mf-blue font-bold text-mf-blue"
                  : "border-transparent text-mf-muted hover:text-mf-navy"
              }`}
            >
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </div>

      <div
        id="agenda-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={-1}
        className="focus-visible:outline-none"
      >
        <div className="mt-6 flex items-center justify-between gap-4">
          <h2 aria-live="polite" className="text-lg leading-7 text-mf-navy sm:text-xl">
            {formatDayLabel(day, today)}
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Día anterior"
              onClick={() => setDay((value) => addDays(value, -1))}
              className={iconButton}
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Día siguiente"
              onClick={() => setDay((value) => addDays(value, 1))}
              className={iconButton}
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>
        </div>

        <div className="mt-6 pb-8">
          {status === "loading" && <AgendaSkeleton />}

          {status === "error" && (
            <div
              role="alert"
              className="mx-auto mt-6 max-w-md rounded-2xl border border-mf-coral/40 bg-mf-coral-tint p-6 text-center"
            >
              <p className="font-bold text-[#b63d4a]">No pudimos cargar tus reuniones</p>
              <p className="mt-1 text-sm text-mf-navy">{errorMessage}</p>
              <button
                type="button"
                onClick={() => void load()}
                className={`${btnPrimary} mt-4 h-11 px-6 text-sm`}
              >
                Reintentar
              </button>
            </div>
          )}

          {status === "ready" && visible.length > 0 && (
            <ul key={`${tab}-${day.getTime()}`} className="space-y-4">
              {visible.map((meeting, index) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  index={index}
                  now={now}
                  onSummary={(m) => setDialog({ type: "summary", meeting: m })}
                  onCopy={copyLink}
                  onEdit={(m) => setDialog({ type: "edit", meeting: m })}
                  onCancel={(m) => setDialog({ type: "cancel", meeting: m })}
                />
              ))}
            </ul>
          )}

          {status === "ready" && visible.length === 0 && (
            <div
              key={`empty-${tab}-${day.getTime()}`}
              className="mf-enter mx-auto flex max-w-md flex-col items-center py-6 text-center sm:py-10"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-mf-yellow/60 text-mf-navy">
                <CalendarIcon className="size-8" />
              </span>
              <h3 className="mt-6 text-xl font-bold leading-7 text-mf-navy">{emptyTitle}</h3>
              <p className="mt-2 text-sm text-mf-muted">
                Cuando programes una reunión, aparecerá aquí
              </p>
              <button
                type="button"
                onClick={() => setDialog({ type: "create" })}
                className={`${btnPrimary} mt-6 h-12 px-8 text-sm`}
              >
                Programar reunión
              </button>
              {jumpDay && (
                <button
                  type="button"
                  onClick={() => setDay(jumpDay)}
                  className={`${btnSecondary} mt-3 h-10 border-transparent bg-transparent text-sm text-mf-blue hover:underline`}
                >
                  {tab === "proximas" ? "Ir a la próxima reunión" : "Ir a la última reunión"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog?.type === "create" && (
        <MeetingFormDialog
          mode="create"
          initialDay={day}
          onClose={closeDialog}
          onCreated={(startAt) => {
            closeDialog();
            setTab("proximas");
            setDay(startOfDay(startAt));
            showToast("Reunión programada");
            void load(true);
          }}
        />
      )}
      {dialog?.type === "edit" && (
        <MeetingFormDialog
          mode="edit"
          meeting={dialog.meeting}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            showToast("Reunión actualizada");
            void load(true);
          }}
        />
      )}
      {dialog?.type === "cancel" && (
        <CancelDialog
          meeting={dialog.meeting}
          onClose={closeDialog}
          onCancelled={() => {
            closeDialog();
            showToast("Reunión cancelada");
            void load(true);
          }}
        />
      )}
      {dialog?.type === "summary" && <SummaryDialog meeting={dialog.meeting} onClose={closeDialog} />}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center"
      >
        {toast && (
          <p
            key={toast.id}
            className={`mf-enter pointer-events-auto rounded-xl px-5 py-3 text-sm font-bold shadow-xl ${
              toast.tone === "error" ? "bg-mf-coral text-white" : "bg-mf-navy text-white"
            }`}
          >
            {toast.message}
          </p>
        )}
      </div>
    </section>
  );
}

function AgendaSkeleton() {
  return (
    <ul aria-label="Cargando reuniones" aria-busy="true" className="space-y-4">
      {[0, 1].map((key) => (
        <li
          key={key}
          className="mf-skeleton grid min-h-[88px] grid-cols-[1fr_auto] items-center gap-4 rounded-[20px] border-[1.5px] border-mf-yellow/60 bg-white px-[18px] py-4 md:grid-cols-[6rem_minmax(0,1fr)_auto] lg:grid-cols-[22rem_minmax(0,1fr)_auto]"
        >
          <span className="h-5 w-14 rounded bg-mf-line" />
          <span className="hidden space-y-2 md:block">
            <span className="block h-4 w-48 rounded bg-mf-line" />
            <span className="block h-3.5 w-36 rounded bg-mf-line/70" />
          </span>
          <span className="h-10 w-40 rounded-lg bg-mf-line" />
        </li>
      ))}
    </ul>
  );
}
