"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: string;
  /** Si es false, Escape, la × y el clic en el fondo no cierran (p. ej. mientras se guarda). */
  dismissible?: boolean;
  size?: "sm" | "lg";
};

/**
 * Modal con el aspecto del auth-modal de develop (overlay #8b93c7/55, radio 14,
 * fondo claro, título 22px y × a la derecha) sobre <dialog>: showModal() aporta
 * role=dialog, trampa de foco, fondo inerte, Escape y devolución del foco.
 * Se monta solo mientras esté abierto.
 */
export function Modal({
  title,
  onClose,
  children,
  description,
  dismissible = true,
  size = "sm",
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      className={`m-auto w-[calc(100%-1.75rem)] rounded-[14px] bg-mf-light p-0 text-mf-navy shadow-[0_8px_30px_rgba(28,36,82,0.12)] backdrop:bg-[#8b93c7]/55 ${
        size === "lg" ? "max-w-xl" : "max-w-[360px]"
      }`}
    >
      <div className="max-h-[85vh] overflow-y-auto px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 break-words text-[22px] font-bold leading-tight text-mf-navy">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Cerrar"
            className="shrink-0 text-[28px] font-light leading-none text-mf-navy focus-visible:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mf-blue disabled:opacity-50"
          >
            ×
          </button>
        </div>
        {description && <p className="mt-1 text-sm text-mf-muted">{description}</p>}
        {children}
      </div>
    </dialog>
  );
}
