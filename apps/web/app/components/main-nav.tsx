"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { onBlueFocus } from "./brand-logo";

// Solo las dos secciones del producto. Las rutas de desarrollo
// (/room, /waiting-room, /demo-sala, /historial) siguen existiendo pero no se enlazan.
const navigation = [
  { href: "/home", label: "Inicio" },
  { href: "/agenda", label: "Mis reuniones" },
];

/** Píldora de navegación (Inicio / Mis reuniones) compartida por home y AppShell. */
export function MainNav({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegación principal" className={`flex justify-center ${className}`}>
      <ul className="flex items-center gap-2 rounded-2xl bg-mf-nav px-3 py-2 sm:gap-6 sm:px-6">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm font-bold transition-colors sm:text-base ${onBlueFocus} ${
                  isActive
                    ? "text-mf-yellow underline underline-offset-4"
                    : "text-white hover:text-mf-yellow"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
