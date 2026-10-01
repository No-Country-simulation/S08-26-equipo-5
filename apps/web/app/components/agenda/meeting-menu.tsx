"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DotsIcon } from "./icons";
import { IconButton } from "../ui/button";

export type MenuAction = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

/** Menú desplegable ("…") con role=menu, navegación por flechas, Escape y clic fuera. */
export function MeetingMenu({ title, actions }: { title: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function getItems() {
    return Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
  }

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  // Foco al primer ítem al abrir.
  useEffect(() => {
    if (open) rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open]);

  // Clic/tap fuera cierra el menú.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = getItems();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        ref={triggerRef}
        aria-label={`Más acciones de ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <DotsIcon className="size-5" />
      </IconButton>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Acciones de ${title}`}
          onKeyDown={onMenuKeyDown}
          className="mf-enter absolute right-0 top-full z-30 mt-2 w-52 rounded-[14px] border border-mf-line bg-white p-1.5 shadow-[0_8px_30px_rgba(28,36,82,0.12)]"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                action.onSelect();
              }}
              className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-colors focus-visible:shadow-none focus-visible:outline-none ${
                action.danger
                  ? "text-red-600 hover:bg-mf-coral-tint focus-visible:bg-mf-coral-tint"
                  : "text-mf-navy hover:bg-mf-blue-tint focus-visible:bg-mf-blue-tint"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
