"use client";

import { useState, type CSSProperties } from "react";
import { initialsFromName } from "../../lib/participant-name";

type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<UserAvatarSize, string> = {
  xs: "h-7 w-7 text-xs",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl",
  xl: "h-20 w-20 text-2xl",
};

type UserAvatarProps = {
  /** Nombre completo: da las iniciales de respaldo y el alt de la foto. */
  name: string;
  /** URL de la foto; null/undefined/"" muestra las iniciales. */
  src?: string | null;
  size?: UserAvatarSize;
  /** Cuántas iniciales mostrar cuando no hay foto. */
  initialsCount?: 1 | 2;
  /**
   * true cuando el nombre ya se muestra al lado: el avatar es decorativo y se
   * oculta a lectores de pantalla. false: la foto lleva alt con el nombre.
   */
  decorative?: boolean;
  /** Colores del respaldo de iniciales (reemplaza los por defecto). */
  fallbackClassName?: string;
  /** Clases extra del contenedor. */
  className?: string;
  style?: CSSProperties;
};

const FALLBACK_COLORS = "bg-[#d9dce8] text-[#252d54]";

/**
 * Avatar de persona: foto con respaldo a iniciales. Si la imagen falla al
 * cargar (URL vencida, bloqueada) cae a las iniciales en vez de dejar un
 * ícono roto.
 */
export function UserAvatar({
  name,
  src,
  size = "sm",
  initialsCount = 2,
  decorative = false,
  fallbackClassName = FALLBACK_COLORS,
  className = "",
  style,
}: UserAvatarProps) {
  // Se guarda la URL que falló (no un booleano): si cambia la foto, se reintenta.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && src !== failedSrc;
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${sizeClasses[size]}`;
  const label = name.trim() || "Avatar de perfil";

  return (
    <span
      className={`${base} ${showPhoto ? "bg-[#d9dce8]" : fallbackClassName} ${className}`}
      style={style}
      {...(decorative ? { "aria-hidden": true } : showPhoto ? {} : { role: "img", "aria-label": label })}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- URLs externas (Cloudinary/Stream) con fallback propio
        <img
          src={src!}
          alt={decorative ? "" : label}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(src ?? null)}
          className="h-full w-full object-cover"
        />
      ) : (
        initialsFromName(name, initialsCount)
      )}
    </span>
  );
}
