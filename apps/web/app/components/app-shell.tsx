"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { LoginModal } from "./login-modal";

const navigation = [
  { href: "/home", label: "Inicio" },
  { href: "/waiting-room", label: "Sala de espera" },
  { href: "/room", label: "Sala" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agenda", label: "Agenda" },
  { href: "/historial", label: "Historial" },
  { href: "/demo-sala", label: "🧪 Demo" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/home" className="text-xl font-bold tracking-tight text-slate-950">
            MeetFlow
          </Link>
          <nav aria-label="Navegación principal" className="flex flex-wrap items-center gap-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {isAuthenticated ? (
            <button type="button" onClick={logout} className="text-sm font-medium text-slate-600 hover:text-slate-950">Cerrar sesión</button>
          ) : (
            <div className="flex gap-3 text-sm font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setLoginOpen(true);
                }}
                className="text-slate-600 hover:text-slate-950"
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("register");
                  setLoginOpen(true);
                }}
                className="text-blue-600 hover:text-blue-700"
              >
                Registrarse
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-10">{children}</main>
      <LoginModal
        open={loginOpen}
        initialMode={authMode}
        onClose={() => setLoginOpen(false)}
      />
    </div>
  );
}
