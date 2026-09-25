"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../lib/auth";

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: "login" | "register";
};

export function LoginModal({
  open,
  onClose,
  onSuccess,
  initialMode = "login",
}: LoginModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [initialMode, onClose, open]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "register") {
        await register(form);
        await login(form.email, form.password);
      } else {
        await login(form.email, form.password);
      }
      setForm({ nombre: "", apellido: "", email: "", password: "" });
      onClose();
      onSuccess?.();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar inicio de sesión"
          className="absolute right-4 top-4 rounded-lg p-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-950"
        >
          ×
        </button>

        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          MeetFlow
        </p>
        <h2 id="auth-modal-title" className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h2>
        <p className="mt-3 text-sm text-slate-600">
          {mode === "login"
            ? "Ingresá para crear reuniones y acceder a tu dashboard."
            : "Registrate para crear reuniones y administrar tu agenda."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {mode === "register" && (
            <div className="grid gap-5 sm:grid-cols-2">
              {(["nombre", "apellido"] as const).map((field) => (
                <label key={field} className="block text-sm font-medium capitalize text-slate-700">
                  {field}
                  <input
                    value={form[field]}
                    onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                    autoComplete={field === "nombre" ? "given-name" : "family-name"}
                    required
                    className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
                  />
                </label>
              ))}
            </div>
          )}
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              autoComplete="email"
              required
              className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal text-slate-950"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Contraseña
            <span className="relative mt-2 block">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
                required
                className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-11 font-normal text-slate-950"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-950"
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? mode === "login" ? "Ingresando…" : "Creando cuenta…"
              : mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {mode === "login" ? "¿Todavía no tenés cuenta?" : "¿Ya tenés cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setMode((current) => current === "login" ? "register" : "login");
            }}
            className="font-semibold text-blue-600 hover:underline"
          >
            {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </p>
      </div>
    </div>
  );
}
