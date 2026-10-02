import type { Metadata } from "next";
import type { ReactNode } from "react";

// La URL lleva el token de invitación: sin Referer para que no se filtre a
// otros sitios si la página enlaza o carga recursos externos.
export const metadata: Metadata = {
  title: "Invitación a una reunión · MeetFlow",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function InvitacionLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
