"use client";

import { useCounterStore } from "./counter-store";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="w-full max-w-sm rounded-card bg-surface p-8 text-center shadow-card ring-1 ring-border">
        <h1 className="text-2xl font-semibold">Contador con Zustand</h1>
        <p className="mt-6 text-5xl font-bold tabular-nums">{useCounterStore((state) => state.count)}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            className="rounded-button bg-neutral-900 px-4 py-2 font-medium text-white transition-colors hover:bg-neutral-700"
            onClick={() => useCounterStore.getState().decrement()}
          >
            Restar
          </button>
          <button
            className="rounded-button bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-700"
            onClick={() => useCounterStore.getState().increment()}
          >
            Sumar
          </button>
        </div>
        <button
          className="mt-4 text-sm text-muted-foreground underline hover:text-neutral-700"
          onClick={() => useCounterStore.getState().reset()}
        >
          Reiniciar
        </button>
      </section>
    </main>
  );
}
