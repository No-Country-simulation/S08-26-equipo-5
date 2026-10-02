"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HomeHeader } from "./home-header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/room") {
    return (
      <div className="min-h-dvh bg-[#080b19] text-white">
        <main className="min-h-dvh">{children}</main>
      </div>
    );
  }

  if (pathname === "/waiting-room") {
    return (
      <div className="flex min-h-screen flex-col bg-mf-blue text-mf-navy">
        <div className="bg-mf-blue">
          <HomeHeader />
        </div>
        <main className="mx-3.5 flex-1 rounded-t-[28px] bg-mf-light px-4 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-mf-blue text-mf-navy">
      <HomeHeader />
      <main className="mx-3.5 flex-1 rounded-t-[28px] bg-mf-light px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
