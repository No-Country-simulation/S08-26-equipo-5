import type { ReactNode } from "react";

const tones = {
  info: "bg-mf-blue-tint text-mf-blue",
  success: "bg-mf-green-tint text-mf-green",
  danger: "bg-mf-coral-tint text-[#b63d4a]",
  neutral: "bg-[#ecedf2] text-mf-muted",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
