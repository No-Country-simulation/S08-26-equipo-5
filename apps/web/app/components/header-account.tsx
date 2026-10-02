"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { AuthModal } from "./auth-modal";
import { useAuth } from "../lib/auth";
import { removeProfilePhoto, uploadProfilePhoto } from "../lib/usuarios-api";

const accountButton =
  "rounded-lg px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

function Avatar({ name, photo, size = "normal" }: { name: string; photo: string | null; size?: "small" | "normal" | "large" }) {
  const sizeClass = size === "small" ? "h-7 w-7 text-xs" : size === "large" ? "h-20 w-20 text-2xl" : "h-9 w-9 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#d9dce8] font-semibold text-[#252d54] ${sizeClass}`}
      aria-label={name || "Avatar de perfil"}
    >
      {photo ? <Image src={photo} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function HeaderAccount() {
  const { isAuthenticated, user, logout, refreshUser } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ") || "Mi cuenta";

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
        setProfileOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setProfileOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (!isAuthenticated) {
    return (
      <>
        <button type="button" onClick={() => setLoginOpen(true)} className={`${accountButton} border border-white/40 uppercase`}>
          Iniciar sesión
        </button>
        <AuthModal open={loginOpen} initialMode="login" onClose={() => setLoginOpen(false)} />
      </>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => {
          setMenuOpen((open) => !open);
          setProfileOpen(false);
        }}
        className="flex items-center gap-2 rounded-xl bg-[#2f3ba8]/90 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#27328f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Avatar name={fullName} photo={user?.fotoUrl ?? null} size="small" />
        <span className="max-w-28 truncate">{user?.nombre || "Cuenta"}</span>
        <svg viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#20294f] p-2 text-white shadow-xl" role="menu">
          <div className="flex items-center gap-2.5 border-b border-white/15 px-2 py-2.5">
            <Avatar name={fullName} photo={user?.fotoUrl ?? null} size="small" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{fullName}</p>
              <p className="truncate text-xs text-white/65">{user?.email ?? ""}</p>
            </div>
          </div>
          {profileOpen ? (
            <div className="px-2 py-2" role="group" aria-label="Datos del perfil">
              <button type="button" onClick={() => setProfileOpen(false)} className="mb-2 text-xs text-white/65 hover:text-white">← Volver al menú</button>
              <p className="text-sm font-semibold">{fullName}</p>
              <p className="mt-1 break-all text-xs text-white/65">{user?.email}</p>
              <p className="mt-2 text-xs text-white/65">{user?.nombre} {user?.apellido}</p>
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => setProfileOpen(true)} className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10">Mi perfil</button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-white/10"
              >
                Configuración
              </button>
              <div className="my-1 border-t border-white/15" />
              <button type="button" role="menuitem" onClick={() => void logout()} className="block w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-[#f07883] hover:bg-white/10">Cerrar sesión</button>
            </>
          )}
        </div>
      )}

      {settingsOpen && (
        <ProfileSettingsDialog
          onClose={() => setSettingsOpen(false)}
          onPhotoChanged={async () => {
            await refreshUser();
          }}
        />
      )}
    </div>
  );
}

function ProfileSettingsDialog({ onClose, onPhotoChanged }: { onClose: () => void; onPhotoChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fullName = [user?.nombre, user?.apellido].filter(Boolean).join(" ");

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  function onSelectFile(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setSaved(false);
    const selected = event.target.files?.[0] ?? null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = selected ? URL.createObjectURL(selected) : null;
    setPreviewUrl(previewUrlRef.current);
    setFile(selected);
  }

  async function savePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setSaving(true);
    setError("");
    try {
      await uploadProfilePhoto(file);
      await onPhotoChanged();
      setSaved(true);
      setFile(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la foto.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePhoto() {
    setSaving(true);
    setError("");
    try {
      await removeProfilePhoto();
      await onPhotoChanged();
      setFile(null);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo quitar la foto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#080b19]/55 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="profile-settings-title" className="w-full max-w-md rounded-[24px] border border-[#e8dc76] bg-[#f7f7fa] p-5 text-[#1c2452] shadow-[0_18px_55px_rgba(8,11,25,0.3)] sm:p-6">
        <header className="flex items-center justify-between">
          <h2 id="profile-settings-title" className="text-lg font-bold">Editar foto de perfil</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="rounded-lg p-1 text-2xl leading-none text-[#1c2452] hover:bg-[#e9eaf1] disabled:opacity-50">×</button>
        </header>

        <form onSubmit={savePhoto} className="mt-4">
          <div className="flex flex-col items-center">
            <Avatar name={fullName} photo={previewUrl ?? user?.fotoUrl ?? null} size="large" />
            <label className="mt-3 cursor-pointer text-sm font-medium text-[#3d4fdb] underline-offset-2 hover:underline">
              Cambiar foto
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onSelectFile} className="sr-only" />
            </label>
            {user?.fotoUrl && !file && (
              <button type="button" onClick={() => void deletePhoto()} disabled={saving} className="mt-1 text-xs text-[#d94f62] hover:underline disabled:opacity-50">Quitar foto</button>
            )}
          </div>

          {error && <p role="alert" className="mt-3 rounded-lg bg-[#fff0f1] px-3 py-2 text-sm text-[#ba3444]">{error}</p>}
          {saved && <p role="status" className="mt-3 text-sm font-medium text-emerald-700">Perfil actualizado.</p>}
          <footer className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-[#d94f62] px-5 py-2.5 text-sm font-semibold text-[#d94f62] hover:bg-[#fff0f1] disabled:opacity-50">Cancelar</button>
            <button type="submit" disabled={!file || saving} className="rounded-xl border border-[#3d4fdb] bg-[#3d4fdb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#3344c4] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
