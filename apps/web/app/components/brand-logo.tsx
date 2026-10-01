import Image from "next/image";
import Link from "next/link";

const LOGO_URL =
  "https://res.cloudinary.com/dsiizolgq/image/upload/v1790777798/Imagen_de_ChatGPT_26_sept_2026_20_06_45_1_byfv9h.png";

/** Foco visible amarillo para controles sobre el fondo azul de marca. */
export const onBlueFocus =
  "focus-visible:outline-mf-yellow focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2";

/** Logo de MeetFlow (PNG blanco) enlazado al inicio; compartido por home y AppShell. */
export function BrandLogo({ className = "h-10 sm:h-12" }: { className?: string }) {
  return (
    <Link
      href="/home"
      aria-label="MeetFlow, ir al inicio"
      className={`justify-self-start rounded-lg ${onBlueFocus}`}
    >
      <Image src={LOGO_URL} alt="MeetFlow" width={180} height={60} priority className={`${className} w-auto`} />
    </Link>
  );
}
