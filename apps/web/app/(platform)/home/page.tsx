"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "../../lib/auth";
import { createSala, getSalaByCode, type Sala } from "../../lib/salas-api";
import { LoginModal } from "../../components/login-modal";

type CreateMode = "instant" | "scheduled";

function formatMeetingDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HomePage() {
  const [createMode, setCreateMode] = useState<CreateMode>("instant");
  const [scheduledAt, setScheduledAt] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdSala, setCreatedSala] = useState<Sala | null>(null);
  const [joinedSala, setJoinedSala] = useState<Sala | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const { isAuthenticated, isReady } = useAuth();

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreatedSala(null);
    setJoinedSala(null);

    if (createMode === "scheduled" && !scheduledAt) {
      setError("Elegí una fecha y hora para programar la reunión.");
      return;
    }
    if (isReady && !isAuthenticated) {
      setLoginOpen(true);
      return;
    }

    setLoading("create");
    try {
      const sala = await createSala({
        nombre: createMode === "instant" ? "Reunión instantánea" : "Reunión programada",
        fechaInicio:
          createMode === "instant"
            ? new Date().toISOString()
            : new Date(scheduledAt).toISOString(),
      });
      setCreatedSala(sala);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo crear la reunión.",
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    setError("");
    setCreatedSala(null);
    setJoinedSala(null);

    if (!code) {
      setError("Ingresá el código de la reunión.");
      return;
    }

    setLoading("join");
    try {
      setJoinedSala(await getSalaByCode(code));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "El enlace o código no es válido.",
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <section aria-labelledby="page-title" className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Home
        </p>
        <h1 id="page-title" className="mt-3 text-4xl font-bold tracking-tight text-slate-950">
          ¿Qué querés hacer?
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Creá una reunión nueva o ingresá a una sala usando un enlace o código.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form data-create-room onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Crear reunión</h2>
          <p className="mt-2 text-sm text-slate-600">
            Elegí si querés comenzar ahora o dejarla programada.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {([
              ["instant", "Comenzar ahora", "La sala queda activa inmediatamente."],
              ["scheduled", "Programar", "Elegí cuándo querés reunirte."],
            ] as const).map(([value, label, description]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  createMode === value
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="create-mode"
                  value={value}
                  checked={createMode === value}
                  onChange={() => setCreateMode(value)}
                  className="sr-only"
                />
                <span className="font-medium text-slate-950">{label}</span>
                <span className="mt-1 block text-sm text-slate-600">{description}</span>
              </label>
            ))}
          </div>

          {createMode === "scheduled" && (
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Fecha y hora
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                required
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading !== null}
            className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "create" ? "Creando..." : "Crear reunión"}
          </button>
        </form>

        <form onSubmit={handleJoin} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Ingresar a una reunión</h2>
          <p className="mt-2 text-sm text-slate-600">
            Pegá el código que te compartieron para validar la sala.
          </p>
          <label className="mt-6 block text-sm font-medium text-slate-700">
            Código de reunión
            <input
              type="text"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Ej. ABC-123"
              autoComplete="off"
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal uppercase tracking-widest text-slate-950 placeholder:normal-case placeholder:tracking-normal"
            />
          </label>
          <button
            type="submit"
            disabled={loading !== null}
            className="mt-6 w-full rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "join" ? "Validando..." : "Ingresar por código"}
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {(createdSala || joinedSala) && (
        <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
            {createdSala ? "Reunión creada" : "Sala encontrada"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {createdSala?.nombre ?? joinedSala?.nombre}
          </h2>
          <p className="mt-2 text-sm text-slate-700">
            Código: <strong className="tracking-widest">{createdSala?.codigo ?? joinedSala?.codigo}</strong>
          </p>
          {(createdSala ?? joinedSala)?.fechaInicio && (
            <p className="mt-1 text-sm text-slate-700">
              {formatMeetingDate((createdSala ?? joinedSala)!.fechaInicio)}
            </p>
          )}
          <Link
            href={createdSala
              ? `/room?code=${encodeURIComponent(createdSala.codigo)}&host=true&salaId=${encodeURIComponent(createdSala.id)}&callId=${encodeURIComponent(createdSala.streamRoomId ?? "")}`
              : `/waiting-room?code=${encodeURIComponent(joinedSala!.codigo)}`}
            id="go-to-waiting-room-btn"
            className="mt-5 inline-flex rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white hover:bg-green-800"
          >
            {createdSala ? "Entrar a la sala como anfitrión" : "Continuar a la sala de espera"}
          </Link>
        </div>
      )}
      </section>
      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          const form = document.querySelector<HTMLFormElement>("form[data-create-room]");
          form?.requestSubmit();
        }}
      />
    </>
  );
}
