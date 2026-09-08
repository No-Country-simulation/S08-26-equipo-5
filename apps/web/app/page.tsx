"use client";

import { useCounterStore } from "./counter-store";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <section className="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold">Contador con Zustand</h1>
        <p className="mt-6 text-5xl font-bold tabular-nums">{useCounterStore((state) => state.count)}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700"
            onClick={() => useCounterStore.getState().decrement()}
          >
            Restar
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500"
            onClick={() => useCounterStore.getState().increment()}
          >
            Sumar
          </button>
        </div>
        <button
          className="mt-4 text-sm text-slate-500 underline hover:text-slate-700"
          onClick={() => useCounterStore.getState().reset()}
        >
          Reiniciar
        </button>
      </section>
    </main>
  );
}
