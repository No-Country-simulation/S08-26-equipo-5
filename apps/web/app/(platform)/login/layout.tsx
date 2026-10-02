import type { Metadata } from "next";
import type { ReactNode } from "react";

// /login?next=/invitacion/<token> puede llevar el token de invitación en la
// URL: evita que se filtre por el header Referer al navegar a otros sitios.
export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
