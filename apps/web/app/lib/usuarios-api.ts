import { getAccessToken } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

type ApiErrorResponse = {
  error?: string | { message?: string };
  message?: string;
};

async function requestPhoto(path: string, init: RequestInit) {
  const token = getAccessToken();
  if (!token) throw new Error("Iniciá sesión para editar tu perfil.");

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    const message = typeof body?.error === "string"
      ? body.error
      : body?.error?.message ?? body?.message ?? "No se pudo actualizar la foto de perfil.";
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json() as Promise<{ fotoUrl: string | null }>;
}

export async function uploadProfilePhoto(file: File) {
  const formData = new FormData();
  formData.append("foto", file);
  const result = await requestPhoto("/usuarios/me/foto", { method: "PUT", body: formData });
  return result?.fotoUrl ?? null;
}

export async function removeProfilePhoto() {
  await requestPhoto("/usuarios/me/foto", { method: "DELETE" });
}
