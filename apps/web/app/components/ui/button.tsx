import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * Botones de MeetFlow, alineados con el sistema del home de develop
 * (home-hero / auth-modal): pastilla, texto en negrita, hover con opacidad
 * y anillo de foco de 2px con offset 2.
 */
const base =
  "inline-flex items-center justify-center rounded-full font-bold transition-[opacity,background-color,color,border-color] focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-mf-blue text-white hover:opacity-90 focus-visible:outline-mf-navy",
  secondary:
    "border border-mf-line bg-white text-mf-navy hover:border-mf-blue hover:text-mf-blue focus-visible:outline-mf-blue",
  danger: "bg-red-600 text-white hover:opacity-90 focus-visible:outline-mf-navy",
  ghost: "text-mf-blue hover:underline focus-visible:outline-mf-blue",
} as const;

const sizes = {
  sm: "px-4 py-2.5 text-[12px]", // idéntico al botón de las tarjetas del home
  md: "px-5 py-3 text-sm",
  lg: "px-8 py-3.5 text-sm",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

/** Clases de botón, para usar también sobre <Link>. */
export function buttonClass({
  variant = "primary",
  size = "sm",
  className = "",
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}

const iconButtonBase =
  "inline-flex size-10 items-center justify-center rounded-[10px] border border-mf-line bg-white text-mf-muted transition-colors hover:border-mf-blue hover:text-mf-blue focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:cursor-not-allowed disabled:opacity-50";

/** Botón cuadrado con ícono (flechas de día, menú "…"); mismo borde que los inputs del home. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function IconButton({ className = "", type = "button", ...props }, ref) {
    return <button ref={ref} type={type} className={`${iconButtonBase} ${className}`.trim()} {...props} />;
  },
);
