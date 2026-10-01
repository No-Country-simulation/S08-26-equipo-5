"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth";
import { AuthModal } from "./auth-modal";
import { HomeHeader } from "./home-header";

const headerButton =
  "rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-white/10 focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWaitingRoom = pathname === "/waiting-room";
  const { isAuthenticated, logout, user } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  function openAuth(mode: "login" | "register") {
    setAuthMode(mode);
    setLoginOpen(true);
  }

  const trailing = isAuthenticated ? (
    <>
      {user && (
        <span className="hidden max-w-[10rem] truncate text-[12px] text-white/80 lg:inline">
          {user.nombre}
        </span>
      )}
      <button type="button" onClick={logout} className={`${headerButton} border border-white/40`}>
        Cerrar sesión
      </button>
    </>
  ) : (
    <>
      <button type="button" onClick={() => openAuth("login")} className={headerButton}>
        Iniciar sesión
      </button>
      <button
        type="button"
        onClick={() => openAuth("register")}
        className={`${headerButton} bg-white !text-[#1c2452] hover:!bg-white/90`}
      >
        Registrarse
      </button>
    </>
  );

  if (pathname === "/room") {
    return (
      <div className="min-h-dvh bg-[#080b19] text-white">
        <main className="min-h-dvh">{children}</main>
        <AuthModal open={loginOpen} initialMode={authMode} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  if (isWaitingRoom) {
    return (
      <div className="flex min-h-screen flex-col bg-mf-blue text-mf-navy">
        <div className="bg-mf-blue">
          <HomeHeader trailing={trailing} />
        </div>
        <main className="mx-3.5 flex-1 rounded-t-[28px] bg-mf-light px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <AuthModal open={loginOpen} initialMode={authMode} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-mf-blue text-mf-navy">
      <HomeHeader trailing={trailing} />
      <main className="mx-3.5 flex-1 rounded-t-[28px] bg-mf-light px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
      <AuthModal open={loginOpen} initialMode={authMode} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
