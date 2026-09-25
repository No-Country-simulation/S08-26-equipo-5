"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const ACCESS_TOKEN_KEY = "meetflow.accessToken";
const REFRESH_TOKEN_KEY = "meetflow.refreshToken";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
};

type RegisterResponse = {
  message: string;
  userId: string;
};

export type AuthUser = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
};

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
  }) => Promise<RegisterResponse>;
  logout: () => Promise<void>;
};

type ApiErrorResponse = {
  error?: {
    message?: string;
  };
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function authRequest<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(responseBody?.error?.message ?? "No se pudo completar la solicitud.");
  }

  return response.json() as Promise<T>;
}

async function getCurrentUser(token: string) {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("La sesión expiró.");
  return response.json() as Promise<AuthUser>;
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function subscribeToAuth(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("meetflow-auth-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("meetflow-auth-change", callback);
  };
}

function notifyAuthChange() {
  window.dispatchEvent(new Event("meetflow-auth-change"));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const accessToken = useSyncExternalStore(subscribeToAuth, getAccessToken, () => null);
  const isReady = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    let active = true;
    void getCurrentUser(accessToken)
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) {
          window.localStorage.removeItem(ACCESS_TOKEN_KEY);
          window.localStorage.removeItem(REFRESH_TOKEN_KEY);
          notifyAuthChange();
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  async function login(email: string, password: string) {
    const result = await authRequest<AuthResponse>("/auth/login", { email, password });
    window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    notifyAuthChange();
  }

  async function register(input: {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
  }) {
    return authRequest<RegisterResponse>("/auth/register", input);
  }

  async function logout() {
    const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    notifyAuthChange();

    if (refreshToken) {
      try {
        await authRequest("/auth/logout", { refreshToken });
      } catch {
        // La sesión local ya fue cerrada; el token revocado se limpiará igualmente.
      }
    }
  }

  const value = useMemo(
    () => ({
      accessToken,
      user,
      isAuthenticated: Boolean(accessToken),
      isReady,
      login,
      register,
      logout,
    }),
    [accessToken, isReady, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  return context;
}
