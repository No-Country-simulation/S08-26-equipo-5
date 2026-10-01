"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Yellowtail } from "next/font/google";
import { useAuth } from "../lib/auth";

const yellowtail = Yellowtail({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const authenticatedLinks = [
  { href: "/home", label: "Inicio" },
  { href: "/dashboard", label: "Mis reuniones" },
];

export function HomeHeader() {
  const { isAuthenticated, isReady } = useAuth();
  const pathname = usePathname();
  const showAuthenticatedNav = isReady && isAuthenticated;

  return (
    <header className="flex min-h-[60px] shrink-0 flex-col items-start gap-2 px-5 py-3 sm:relative sm:flex-row sm:items-center sm:px-8 sm:py-0">
      <span className={`${yellowtail.className} text-[28px] leading-none text-white`}>
        Meetflow
      </span>

      {showAuthenticatedNav && (
        <nav
          aria-label="Principal"
          className="flex items-center gap-1 rounded-[14px] bg-[#2f3ba8]/85 px-2 py-1.5 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-2 sm:px-3 sm:py-2"
        >
          {authenticatedLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-[12px] font-bold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                  isActive ? "bg-white/20" : "hover:bg-white/10"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
