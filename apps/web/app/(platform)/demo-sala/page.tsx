"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// In-memory event bus — simulates Socket.io without any server
// ---------------------------------------------------------------------------
type EventMap = {
  "join:pending": JoinPendingPayload;
  "join:approved": { participanteId: string };
  "join:rejected": { participanteId: string };
};

type Listener<T> = (payload: T) => void;

class MockSocketBus {
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};
  private log: LogEntry[] = [];
  private logListeners: Array<(log: LogEntry[]) => void> = [];

  on<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>) {
    (this.listeners[event] ??= [] as Array<Listener<EventMap[K]>>).push(fn as Listener<EventMap[K]>);
    return () => this.off(event, fn);
  }

  off<K extends keyof EventMap>(event: K, fn: Listener<EventMap[K]>) {
    this.listeners[event] = (this.listeners[event] as Array<Listener<EventMap[K]>> | undefined)?.filter(
      (l) => l !== fn
    ) as typeof this.listeners[K];
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K], origin: "host" | "participant" | "server") {
    // Add to log
    const entry: LogEntry = {
      id: Math.random().toString(36).slice(2),
      at: new Date(),
      event,
      origin,
      payload,
    };
    this.log = [...this.log, entry];
    this.logListeners.forEach((fn) => fn(this.log));

    // Dispatch to listeners with a micro-delay to simulate network
    setTimeout(() => {
      (this.listeners[event] as Array<Listener<EventMap[K]>> | undefined)?.forEach((fn) =>
        fn(payload)
      );
    }, 120);
  }

  onLog(fn: (log: LogEntry[]) => void) {
    this.logListeners.push(fn);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== fn);
    };
  }

  getLog() {
    return this.log;
  }
}

// Singleton bus shared between both panels in the same page render
const bus = new MockSocketBus();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type JoinPendingPayload = {
  participanteId: string;
  nombre: string;
  apellido: string;
  email: string;
  timestamp: string;
};

type HostRequest = JoinPendingPayload & {
  status: "pending" | "approving" | "rejecting" | "approved" | "rejected";
};

type ParticipantStatus = "idle" | "waiting" | "approved" | "rejected";

type LogEntry = {
  id: string;
  at: Date;
  event: keyof EventMap;
  origin: "host" | "participant" | "server";
  payload: EventMap[keyof EventMap];
};

const SALA_CODE = "DEMO-42";
const SALA_NAME = "Reunión de prueba (demo)";

// ---------------------------------------------------------------------------
// HOST panel
// ---------------------------------------------------------------------------
function HostPanel() {
  const [requests, setRequests] = useState<HostRequest[]>([]);
  const [connected] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const off = bus.on("join:pending", (payload) => {
      setRequests((prev) => {
        if (prev.some((r) => r.participanteId === payload.participanteId)) return prev;
        return [...prev, { ...payload, status: "pending" }];
      });
      // Play notification sound
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } catch {/* ignore */}
    });
    return off;
  }, []);

  const approve = useCallback((participanteId: string) => {
    setRequests((prev) =>
      prev.map((r) => r.participanteId === participanteId ? { ...r, status: "approving" } : r)
    );
    // Simulate server processing delay
    setTimeout(() => {
      bus.emit("join:approved", { participanteId }, "server");
      setRequests((prev) =>
        prev.map((r) => r.participanteId === participanteId ? { ...r, status: "approved" } : r)
      );
    }, 400);
  }, []);

  const reject = useCallback((participanteId: string) => {
    setRequests((prev) =>
      prev.map((r) => r.participanteId === participanteId ? { ...r, status: "rejecting" } : r)
    );
    setTimeout(() => {
      bus.emit("join:rejected", { participanteId }, "server");
      setRequests((prev) =>
        prev.map((r) => r.participanteId === participanteId ? { ...r, status: "rejected" } : r)
      );
    }, 400);
  }, []);

  const pending = requests.filter((r) => ["pending", "approving", "rejecting"].includes(r.status));
  const done = requests.filter((r) => ["approved", "rejected"].includes(r.status));

  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-blue-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-blue-600 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-100">
            Vista: Anfitrión (HOST)
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-white">Panel de solicitudes</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-blue-700 px-3 py-1.5 text-xs font-semibold text-blue-100">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          Socket activo
        </div>
      </div>

      {/* Sala info */}
      <div className="border-b border-slate-100 px-5 py-3">
        <p className="text-sm text-slate-500">
          Sala: <strong className="font-mono text-slate-900">{SALA_CODE}</strong>{" "}
          <span className="text-slate-400">·</span>{" "}
          <span className="text-slate-700">{SALA_NAME}</span>
        </p>
      </div>

      {/* Requests */}
      <div className="flex-1 overflow-y-auto p-4">
        {pending.length === 0 && done.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-400">Sin solicitudes aún</p>
            <p className="mt-1 text-xs text-slate-300">
              Usá el panel de participante para enviar una →
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Solicitudes">
            {pending.map((r) => (
              <li
                key={r.participanteId}
                className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                  r.status === "pending"
                    ? "animate-[slideIn_0.35s_ease-out] border-blue-200 bg-blue-50 shadow-md"
                    : r.status === "approving"
                      ? "border-green-200 bg-green-50"
                      : "border-red-200 bg-red-50"
                }`}
              >
                {r.status === "pending" && (
                  <span aria-hidden="true" className="absolute right-3 top-3 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-200 text-sm font-bold text-blue-800">
                    {r.nombre[0]}{r.apellido[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-950">{r.nombre} {r.apellido}</p>
                    <p className="truncate text-sm text-slate-500">{r.email}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    id={`demo-approve-${r.participanteId}`}
                    disabled={r.status !== "pending"}
                    onClick={() => approve(r.participanteId)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {r.status === "approving" ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Aprobando…
                      </>
                    ) : "✓ Aprobar"}
                  </button>
                  <button
                    type="button"
                    id={`demo-reject-${r.participanteId}`}
                    disabled={r.status !== "pending"}
                    onClick={() => reject(r.participanteId)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
                  >
                    {r.status === "rejecting" ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                        Rechazando…
                      </>
                    ) : "✗ Rechazar"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Resueltas
            </p>
            <ul className="space-y-1.5">
              {done.map((r) => (
                <li key={r.participanteId}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="truncate text-sm text-slate-600">
                    {r.nombre} {r.apellido}
                  </span>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.status === "approved"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-500"
                  }`}>
                    {r.status === "approved" ? "Aprobado" : "Rechazado"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3 text-center text-sm text-slate-500">
          <span className="font-semibold text-blue-600">{pending.length}</span>{" "}
          solicitud{pending.length !== 1 && "es"} pendiente{pending.length !== 1 && "s"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PARTICIPANT panel
// ---------------------------------------------------------------------------
function ParticipantPanel() {
  const [form, setForm] = useState({ nombre: "", apellido: "", email: "" });
  const [status, setStatus] = useState<ParticipantStatus>("idle");
  const [participanteId, setParticipanteId] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const offApproved = bus.on("join:approved", ({ participanteId: pid }) => {
      if (pid !== participanteId) return;
      setStatus("approved");
      setCountdown(3);
    });
    const offRejected = bus.on("join:rejected", ({ participanteId: pid }) => {
      if (pid !== participanteId) return;
      setStatus("rejected");
    });
    return () => { offApproved(); offRejected(); };
  }, [participanteId]);

  // Countdown
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // In demo, just reset to show the redirect would happen
      setStatus("idle");
      setCountdown(null);
      setParticipanteId("");
      setForm({ nombre: "", apellido: "", email: "" });
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.nombre.trim() || !form.apellido.trim() || !form.email.trim()) {
      setError("Completá todos los campos.");
      return;
    }

    const pid = `part-${Date.now()}`;
    setParticipanteId(pid);
    setStatus("waiting");

    // Simulate sending join:request → server processes → emits join:pending to host
    setTimeout(() => {
      bus.emit(
        "join:pending",
        {
          participanteId: pid,
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          email: form.email.trim(),
          timestamp: new Date().toISOString(),
        },
        "server"
      );
    }, 200);
  }

  function handleCancel() {
    setStatus("idle");
    setParticipanteId("");
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border-2 border-violet-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-violet-600 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-100">
            Vista: Participante (GUEST)
          </p>
          <h2 className="mt-0.5 text-lg font-bold text-white">Sala de espera</h2>
        </div>
        <div className="rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-violet-100">
          {SALA_CODE}
        </div>
      </div>

      {/* Sala info */}
      <div className="border-b border-slate-100 px-5 py-3">
        <p className="text-sm text-slate-700 font-medium">{SALA_NAME}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Status banner */}
        <div className={`rounded-xl p-4 transition-all duration-300 ${
          status === "approved"
            ? "bg-green-50 ring-1 ring-green-200"
            : status === "rejected"
              ? "bg-red-50 ring-1 ring-red-200"
              : status === "waiting"
                ? "bg-blue-50 ring-1 ring-blue-200"
                : "bg-slate-50"
        }`}>
          <p className="font-semibold text-slate-900">
            {status === "idle" && "Listo para solicitar ingreso"}
            {status === "waiting" && "⏳ Esperando aprobación del anfitrión…"}
            {status === "approved" && "✅ Ingreso aprobado"}
            {status === "rejected" && "❌ Ingreso rechazado"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {status === "idle" && "Completá el formulario y enviá la solicitud."}
            {status === "waiting" && "El anfitrión recibirá una notificación en tiempo real."}
            {status === "approved" && countdown !== null
              ? `Redirigiendo a la sala en ${countdown}… (demo: vuelve al inicio)`
              : status === "approved" ? "¡Acceso concedido!" : ""}
            {status === "rejected" && "El anfitrión rechazó tu solicitud. Podés volver a intentarlo."}
          </p>
          {status === "waiting" && (
            <div className="mt-3 flex justify-center gap-1.5">
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
            </div>
          )}
          {participanteId && (
            <p className="mt-2 font-mono text-xs text-slate-400">ID: {participanteId}</p>
          )}
        </div>

        {/* Form — only when idle or rejected */}
        {(status === "idle" || status === "rejected") && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4" id="demo-join-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nombre
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ana"
                  className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Apellido
                <input
                  required
                  value={form.apellido}
                  onChange={(e) => setForm((f) => ({ ...f, apellido: e.target.value }))}
                  placeholder="García"
                  className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ana@ejemplo.com"
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              id="demo-request-join-btn"
              className="w-full rounded-lg bg-violet-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-violet-700"
            >
              {status === "rejected" ? "Volver a solicitar ingreso" : "Solicitar ingreso →"}
            </button>
          </form>
        )}

        {status === "waiting" && (
          <button
            type="button"
            onClick={handleCancel}
            className="mt-5 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancelar solicitud
          </button>
        )}

        {status === "approved" && countdown !== null && (
          <div className="mt-5 flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl font-bold text-green-700">
              {countdown}
            </div>
            <p className="text-sm text-slate-500">
              Demo: vuelve al formulario para probar otra vez
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------
function EventLog() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const off = bus.onLog((entries) => {
      setLog([...entries]);
    });
    return off;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  const originColors: Record<string, string> = {
    host: "text-blue-600",
    participant: "text-violet-600",
    server: "text-emerald-600",
  };

  const eventColors: Record<string, string> = {
    "join:pending": "bg-blue-100 text-blue-800",
    "join:approved": "bg-green-100 text-green-800",
    "join:rejected": "bg-slate-100 text-slate-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 shadow-inner">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        📡 Eventos del bus (tiempo real)
      </p>
      {log.length === 0 ? (
        <p className="text-xs text-slate-600 italic">Esperando eventos…</p>
      ) : (
        <ul className="space-y-1.5 font-mono text-xs">
          {log.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="shrink-0 text-slate-600">
                {entry.at.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${eventColors[entry.event] ?? "bg-slate-800 text-slate-200"}`}>
                {entry.event}
              </span>
              <span className={`shrink-0 font-semibold ${originColors[entry.origin] ?? "text-slate-400"}`}>
                [{entry.origin}]
              </span>
              <span className="truncate text-slate-400">
                {JSON.stringify(entry.payload).slice(0, 80)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DemoSalaPage() {
  return (
    <section aria-labelledby="demo-title" className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-600">
            Herramienta de testing
          </p>
          <h1 id="demo-title" className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Demo · Host + Participante
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Simulación completa del flujo de waiting-room{" "}
            <strong>sin backend</strong>. Completá el formulario del participante y observá la
            notificación que le llega al anfitrión en tiempo real.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
          Solo frontend · Sin socket real
        </span>
      </div>

      {/* Instructions */}
      <ol className="flex flex-wrap gap-3 text-sm text-slate-600">
        {[
          "1. Completá nombre, apellido y email en el panel violeta →",
          "2. Hacé click en \"Solicitar ingreso\"",
          "3. Observá la notificación en el panel azul (con sonido)",
          "4. Aprobá o rechazá desde el panel azul",
          "5. El panel violeta muestra la respuesta y el countdown",
        ].map((step) => (
          <li key={step} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            {step}
          </li>
        ))}
      </ol>

      {/* Split panels */}
      <div className="grid gap-5 lg:grid-cols-2" style={{ minHeight: "520px" }}>
        <HostPanel />
        <ParticipantPanel />
      </div>

      {/* Event log */}
      <EventLog />

      {/* Footer note */}
      <p className="text-center text-xs text-slate-400">
        Esta página es solo para desarrollo. Los eventos se procesan en memoria con ~120 ms de delay artificial.
        <br />
        Podés abrir múltiples formularios del participante para simular solicitudes simultáneas.
      </p>
    </section>
  );
}
