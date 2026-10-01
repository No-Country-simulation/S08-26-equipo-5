import type { CSSProperties, ReactNode } from "react";

/** Superficie de tarjeta del home de develop: borde amarillo de 2px, radio 22 y sombra navy suave. */
export const cardClass =
  "rounded-[22px] border-2 border-mf-yellow bg-white shadow-[0_4px_14px_rgba(28,36,82,0.08)]";

export function Card({
  as: Tag = "div",
  className = "",
  style,
  children,
}: {
  as?: "div" | "li";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Tag style={style} className={`${cardClass} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
