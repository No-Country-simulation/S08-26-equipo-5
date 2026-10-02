"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  dayForMonth,
  findJumpDay,
  findJumpMonth,
  formatDateParam,
  formatDayLabel,
  formatMonthLabel,
  getShareLink,
  groupByDay,
  meetingsForDay,
  meetingsForMonth,
  parseDateParam,
  startOfDay,
  type AgendaView,
  TAB_LABELS,
  toMeeting,
  type AgendaTab,
  type Meeting,
} from "../../lib/agenda";
import { createSala, getMisParticipaciones, updateSala } from "../../lib/salas-api";
import { inviteAfterCreate, type InviteOutcome } from "../../lib/invite-emails";
import {
  ScheduleMeetingModal,
  type ImmediateMeetingInput,
  type ScheduleMeetingInput,
} from "../schedule-meeting-modal";
import { InviteDialog, InviteOutcomeDialog } from "../invite-dialogs";
import { CancelDialog } from "./cancel-dialog";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { MeetingCard } from "./meeting-card";
import { SummaryDialog } from "./summary-dialog";
import { Button, IconButton } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";

const TABS: AgendaTab[] = ["proximas", "finalizadas"];

type DialogState =
  | { type: "create" }
  | { type: "edit"; meeting: Meeting }
  | { type: "invite"; meeting: Meeting }
  | { type: "inviteOutcome"; salaId: string; outcome: InviteOutcome }
  | { type: "cancel"; meeting: Meeting }
  | { type: "summary"; meeting: Meeting }
  | null;

type Toast = { id: number; message: string; tone: "success" | "error" } | null;

export function AgendaScreen() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [tab, setTab] = useState<AgendaTab>("proximas");
  // Vista y fecha viven en la URL (?vista=mes&fecha=YYYY-MM-DD) para sobrevivir a recargas y "atrás".
  // AgendaScreen solo se monta después de AuthGuard (ya en el cliente), por eso se puede leer la URL acá.
  const [view, setView] = useState<AgendaView>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("vista") === "mes"
      ? "mes"
      : "dia",
  );
  const [day, setDay] = useState(() => {
    const fromUrl =
      typeof window !== "undefined"
        ? parseDateParam(new URLSearchParams(window.location.search).get("fecha"))
        : null;
    return startOfDay(fromUrl ?? new Date());
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<Toast>(null);
  // Reloj para habilitar "Unirse" a los participantes 10 min antes (se refresca cada minuto).
  const [now, setNow] = useState(() => Date.now());
  const tabRefs = useRef<Record<AgendaTab, HTMLButtonElement | null>>({
    proximas: null,
    finalizadas: null,
  });
  const requestId = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (view === "mes") params.set("vista", "mes");
    else params.delete("vista");
    params.set("fecha", formatDateParam(day));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  }, [view, day]);

  const today = new Date(now);
  const isMonth = view === "mes";
  const visible = isMonth ? meetingsForMonth(meetings, tab, day) : meetingsForDay(meetings, tab, day);
  const groups = isMonth ? groupByDay(visible) : [];
  const jumpDay = isMonth ? findJumpMonth(meetings, tab, day) : findJumpDay(meetings, tab, day);
  const periodKey = isMonth ? `${tab}-mes-${day.getFullYear()}-${day.getMonth()}` : `${tab}-dia-${day.getTime()}`;

  function changeView(next: AgendaView) {
    if (next === view) return;
    // Día -> Mes conserva el mes del día elegido; Mes -> Día elige un día razonable del mes.
    if (next === "dia") setDay(dayForMonth(meetings, tab, day, today));
    setView(next);
  }

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

  /** Abre un modal de formulario recordando el disparador para devolverle el foco. */
  function openForm(next: DialogState) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFormError(null);
    setDialog(next);
  }

  async function handleCreate(input: ScheduleMeetingInput | ImmediateMeetingInput) {
    if (formSubmitting || !("fechaInicio" in input)) return;
    setFormSubmitting(true);
    setFormError(null);
    try {
      const sala = await createSala(input);
      // La reunión ya existe: si las invitaciones fallan no se pierde, se reintentan en un paso aparte.
      const outcome = input.emails?.length
        ? await inviteAfterCreate(sala.id, input.emails)
        : null;
      setTab("proximas");
      setDay(startOfDay(new Date(input.fechaInicio)));
      if (outcome && !outcome.allSent) {
        setDialog({ type: "inviteOutcome", salaId: sala.id, outcome });
      } else {
        closeDialog();
        showToast(outcome ? "Reunión programada e invitaciones enviadas" : "Reunión programada");
      }
      void load(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo programar la reunión.");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleEdit(meeting: Meeting, input: ScheduleMeetingInput | ImmediateMeetingInput) {
    if (formSubmitting) return;
    setFormSubmitting(true);
    setFormError(null);
    try {
      await updateSala(meeting.id, { nombre: input.nombre, resumen: input.resumen ?? null });
      closeDialog();
      showToast("Reunión actualizada");
      void load(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "No se pudo actualizar la reunión.");
    } finally {
      setFormSubmitting(false);
    }
  }

  const emptyTitle = isMonth
    ? `No tienes reuniones ${tab === "proximas" ? "próximas" : "finalizadas"} en ${formatMonthLabel(day).toLowerCase()}`
    : tab === "proximas"
      ? "Aún no tienes reuniones programadas"
      : "Aún no tienes reuniones finalizadas";

  return (
    <section aria-labelledby="agenda-title" className="mx-auto w-full max-w-[1120px] sm:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 id="agenda-title" className="text-[32px] font-bold leading-10 text-mf-navy">
          Mis reuniones
        </h1>
        <Button size="lg" onClick={() => openForm({ type: "create" })} className="w-full sm:w-auto">
          + Programar reunión
        </Button>
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
              className={`-mb-px border-b-2 px-2.5 pb-3 pt-2 text-base transition-colors focus-visible:rounded-t-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue focus-visible:shadow-none ${
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
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 aria-live="polite" className="text-lg leading-7 text-mf-navy sm:text-xl">
            {isMonth ? formatMonthLabel(day) : formatDayLabel(day, today)}
          </h2>
          <div className="flex items-center gap-3">
            <SegmentedControl
              label="Vista de la agenda"
              value={view}
              onChange={changeView}
              options={[
                { value: "dia", label: "Día" },
                { value: "mes", label: "Mes" },
              ]}
            />
            <div className="flex gap-2">
              <IconButton
                aria-label={isMonth ? "Mes anterior" : "Día anterior"}
                onClick={() => setDay((value) => (isMonth ? addMonths(value, -1) : addDays(value, -1)))}
              >
                <ChevronLeftIcon className="size-5" />
              </IconButton>
              <IconButton
                aria-label={isMonth ? "Mes siguiente" : "Día siguiente"}
                onClick={() => setDay((value) => (isMonth ? addMonths(value, 1) : addDays(value, 1)))}
              >
                <ChevronRightIcon className="size-5" />
              </IconButton>
            </div>
          </div>
        </div>

        <div className="mt-6 pb-8">
          {status === "loading" && <AgendaSkeleton />}

          {status === "error" && (
            <div
              role="alert"
              className="mx-auto mt-6 max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center"
            >
              <p className="font-bold text-red-600">No pudimos cargar tus reuniones</p>
              <p className="mt-1 text-sm text-mf-navy">{errorMessage}</p>
              <Button size="md" onClick={() => void load()} className="mt-4">
                Reintentar
              </Button>
            </div>
          )}

          {status === "ready" && visible.length > 0 && !isMonth && (
            <ul key={periodKey} className="space-y-4">
              {visible.map((meeting, index) => (
                <MeetingCard
                  key={meeting.id}
                  meeting={meeting}
                  index={index}
                  now={now}
                  onSummary={(m) => setDialog({ type: "summary", meeting: m })}
                  onCopy={copyLink}
                  onEdit={(m) => openForm({ type: "edit", meeting: m })}
                  onInvite={(m) => setDialog({ type: "invite", meeting: m })}
                  onCancel={(m) => setDialog({ type: "cancel", meeting: m })}
                />
              ))}
            </ul>
          )}

          {status === "ready" && visible.length > 0 && isMonth && (
            <div key={periodKey} className="space-y-8">
              {groups.map((group, groupIndex) => {
                const offset = groups.slice(0, groupIndex).reduce((sum, g) => sum + g.meetings.length, 0);
                const label = formatDayLabel(group.day, today);
                return (
                  <section key={group.day.getTime()} aria-label={label}>
                    <h3 className="mb-3 text-base font-bold leading-6 text-mf-navy">{label}</h3>
                    <ul className="space-y-4">
                      {group.meetings.map((meeting, index) => (
                        <MeetingCard
                          key={meeting.id}
                          meeting={meeting}
                          index={offset + index}
                          now={now}
                          onSummary={(m) => setDialog({ type: "summary", meeting: m })}
                          onCopy={copyLink}
                          onEdit={(m) => openForm({ type: "edit", meeting: m })}
                          onInvite={(m) => setDialog({ type: "invite", meeting: m })}
                          onCancel={(m) => setDialog({ type: "cancel", meeting: m })}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {status === "ready" && visible.length === 0 && (
            <div
              key={`empty-${periodKey}`}
              className="mf-enter mx-auto flex max-w-md flex-col items-center py-6 text-center sm:py-10"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-mf-yellow/60 text-mf-navy">
                <CalendarIcon className="size-8" />
              </span>
              <h3 className="mt-6 text-xl font-bold leading-7 text-mf-navy">{emptyTitle}</h3>
              {/* Invitar a programar solo tiene sentido en Próximas: en Finalizadas
                  una reunión nueva nunca aparecería en esta vista. */}
              {tab === "proximas" && (
                <>
                  <p className="mt-2 text-sm text-mf-muted">
                    Cuando programes una reunión, aparecerá aquí
                  </p>
                  <Button size="lg" onClick={() => openForm({ type: "create" })} className="mt-6">
                    Programar reunión
                  </Button>
                </>
              )}
              {jumpDay && (
                <Button variant="ghost" size="md" onClick={() => setDay(jumpDay)} className="mt-3">
                  {isMonth
                    ? tab === "proximas"
                      ? "Ir al próximo mes con reuniones"
                      : "Ir al último mes con reuniones"
                    : tab === "proximas"
                      ? "Ir a la próxima reunión"
                      : "Ir a la última reunión"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog?.type === "create" && (
        <ScheduleMeetingModal
          mode="schedule"
          open
          allowInvites
          submitting={formSubmitting}
          error={formError}
          returnFocusRef={openerRef}
          onClose={closeDialog}
          onSubmit={(input) => void handleCreate(input)}
        />
      )}
      {dialog?.type === "edit" && (
        <ScheduleMeetingModal
          key={dialog.meeting.id}
          mode="edit"
          open
          submitting={formSubmitting}
          error={formError}
          returnFocusRef={openerRef}
          initialValues={{ nombre: dialog.meeting.title, resumen: dialog.meeting.description }}
          onClose={closeDialog}
          onSubmit={(input) => void handleEdit(dialog.meeting, input)}
        />
      )}
      {dialog?.type === "invite" && (
        <InviteDialog
          salaId={dialog.meeting.id}
          salaTitle={dialog.meeting.title}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "inviteOutcome" && (
        <InviteOutcomeDialog
          salaId={dialog.salaId}
          title="Reunión programada"
          initial={dialog.outcome}
          primaryLabel="Listo"
          onPrimary={closeDialog}
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
        className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center"
      >
        {toast && (
          <p
            key={toast.id}
            className={`mf-enter pointer-events-auto rounded-[14px] px-5 py-3 text-sm font-bold shadow-[0_8px_30px_rgba(28,36,82,0.2)] ${
              toast.tone === "error" ? "bg-red-600 text-white" : "bg-mf-navy text-white"
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
          className="mf-skeleton grid min-h-[88px] grid-cols-[1fr_auto] items-center gap-4 rounded-[22px] border-2 border-mf-yellow/60 bg-white px-4 py-4 md:grid-cols-[6rem_minmax(0,1fr)_auto] lg:grid-cols-[22rem_minmax(0,1fr)_auto]"
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
