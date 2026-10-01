"use client";

import { useAuth } from "../lib/auth";
import { BrandLogo } from "./brand-logo";
import { MainNav } from "./main-nav";

export function HomeHeader() {
  const { isAuthenticated, isReady } = useAuth();
  const showAuthenticatedNav = isReady && isAuthenticated;

  return (
    <header className="flex min-h-[60px] shrink-0 flex-col items-start gap-2 px-5 py-3 sm:relative sm:flex-row sm:items-center sm:px-8 sm:py-0">
      <BrandLogo className="h-9" />

      {showAuthenticatedNav && (
        <MainNav className="sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2" />
      )}
    </header>
  );
}
