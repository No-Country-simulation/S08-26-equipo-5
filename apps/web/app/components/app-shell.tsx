"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "../lib/auth";
import { AuthModal } from "./auth-modal";
import { BrandLogo, onBlueFocus } from "./brand-logo";
import { MainNav } from "./main-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated, logout, user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setLoginOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-mf-blue text-mf-navy">
      <header className="mx-auto grid w-full max-w-[1440px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-7 md:min-h-[72px] md:grid-cols-[1fr_auto_1fr] md:py-0">
        <BrandLogo />
        <MainNav className="order-last col-span-2 md:order-none md:col-span-1" />

        <div className="flex items-center gap-3 justify-self-end text-sm font-bold">
          {isAuthenticated ? (
            <>
              {user && (
                <span className="hidden max-w-[10rem] truncate font-normal text-white/80 lg:inline">
                  {user.nombre}
                </span>
              )}
              <button
                type="button"
                onClick={logout}
                className={`rounded-lg border border-white/40 px-3 py-2 text-white transition-colors hover:bg-white/10 ${onBlueFocus}`}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openAuth("login")}
                className={`rounded-lg px-2 py-2 text-white transition-colors hover:text-mf-yellow ${onBlueFocus}`}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => openAuth("register")}
                className={`rounded-lg bg-mf-yellow px-3 py-2 text-mf-navy transition-colors hover:brightness-95 ${onBlueFocus}`}
              >
                Registrarse
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 px-2 sm:px-4">
        <main className="w-full flex-1 rounded-t-3xl bg-mf-light px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <AuthModal
        open={loginOpen}
        initialMode={authMode}
        onClose={() => setLoginOpen(false)}
      />
    </div>
  );
}
