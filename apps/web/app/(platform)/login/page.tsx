"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { useAuth } from "../../lib/auth";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/home";
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.replace(next.startsWith("/") ? next : "/home");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">MeetFlow</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Iniciar sesión</h1>
        <p className="mt-3 text-sm text-slate-600">Ingresá para crear reuniones y acceder a tu dashboard.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <span className="relative mt-2 block">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 font-normal text-slate-950" />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-950">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  {showPassword ? <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 8.5 4 9.5 6a16.6 16.6 0 0 1-3.1 3.8M6.2 6.2C4.5 7.3 3.3 8.8 2.5 10c1 2 4.5 6 9.5 6 1 0 1.9-.2 2.7-.5" /> : <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2" /></>}
                </svg>
              </button>
            </span>
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Todavía no tenés cuenta? <Link href="/register" className="font-semibold text-blue-600 hover:underline">Crear cuenta</Link>
        </p>
      </div>
    </section>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<p>Cargando…</p>}><LoginContent /></Suspense>;
}
