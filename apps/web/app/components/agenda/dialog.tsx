"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  /** Si es false, Escape y el clic en el fondo no cierran (p. ej. mientras se guarda). */
  dismissible?: boolean;
  className?: string;
};

/**
 * Modal accesible sobre <dialog>: showModal() aporta role=dialog, trampa de foco,
 * inertización del fondo, cierre con Escape y devolución del foco al disparador.
 * Se monta solo mientras esté abierto.
 */
export function Dialog({
  titleId,
  onClose,
  children,
  dismissible = true,
  className = "max-w-lg",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${className} rounded-3xl bg-white p-0 text-mf-navy shadow-2xl backdrop:bg-mf-navy/60 backdrop:backdrop-blur-[2px]`}
    >
      <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">{children}</div>
    </dialog>
  );
}
