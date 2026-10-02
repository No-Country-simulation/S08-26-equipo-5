import type { Metadata } from "next";
import type { ReactNode } from "react";

// La URL lleva el token de restablecimiento: sin Referer para que no se filtre
// a otros sitios, y fuera de los buscadores.
export const metadata: Metadata = {
  title: "Restablecer contraseña · MeetFlow",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function RestablecerContrasenaLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
