import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Recuperar contraseña · MeetFlow",
  robots: { index: false, follow: false },
};

export default function RecuperarContrasenaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
