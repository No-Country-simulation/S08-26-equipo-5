# API de Autenticación — MeetFlow

Documento de consumo para el frontend. Describe **exactamente** los endpoints implementados hoy en `apps/server`.

- Base URL (dev): `http://localhost:4000/api/v1`
- Formato: JSON (`Content-Type: application/json`)
- Autenticación: JWT vía header `Authorization: Bearer <accessToken>`

> Este documento refleja la implementación real de la tarea de auth. Al final hay una sección con las diferencias respecto al contrato general (`docs/Contrato de API REST + Eventos Realtime.pdf`).

---

## 1. Envoltorio de errores

Todas las respuestas de error usan la misma forma:

```json
{
  "error": {
    "code": "CODIGO_DE_ERROR",
    "message": "Mensaje legible"
  }
}
```

Los errores `400 VALIDATION_ERROR` agregan un arreglo `errors` con el detalle por campo:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La solicitud contiene datos inválidos",
    "errors": [{ "campo": "email", "mensaje": "Debe ser un email válido" }]
  }
}
```

| HTTP | `code` | Cuándo ocurre |
|------|--------|---------------|
| 400 | `VALIDATION_ERROR` | Body inválido o campos faltantes |
| 401 | `INVALID_CREDENTIALS` | Email o contraseña incorrectos en login |
| 401 | `INVALID_REFRESH_TOKEN` | El refresh token es inválido, expiró o ya fue usado |
| 401 | `UNAUTHORIZED` | Falta el header `Authorization` o el access token es inválido/expirado |
| 404 | `NOT_FOUND` | Ruta inexistente |
| 409 | `EMAIL_ALREADY_REGISTERED` | El email ya está registrado |
| 500 | `INTERNAL_SERVER_ERROR` | Error inesperado del servidor |

---

## 2. Resumen de endpoints

| Método | Ruta | Auth | Éxito |
|--------|------|------|-------|
| POST | `/api/v1/auth/register` | No | 201 |
| POST | `/api/v1/auth/login` | No | 200 |
| POST | `/api/v1/auth/refresh` | No (el refresh token es la credencial) | 200 |
| POST | `/api/v1/auth/logout` | Bearer | 200 |
| GET | `/api/v1/health` | No | 200 |

---

## 3. POST `/api/v1/auth/register`

Crea un usuario.

**Body**

| Campo | Tipo | Requerido | Reglas |
|-------|------|-----------|--------|
| `nombre` | string | Sí | — |
| `apellido` | string | Sí | — |
| `email` | string | Sí | Formato email válido |
| `password` | string | Sí | Mínimo 8 caracteres |

```json
{
  "nombre": "Juan",
  "apellido": "Pérez",
  "email": "juan@test.com",
  "password": "password123"
}
```

**201 Created**

```json
{
  "message": "Usuario registrado exitosamente",
  "userId": "clx123abc..."
}
```

**Errores**

- `400 VALIDATION_ERROR` — falta algún campo o no cumple las reglas (con `errors[]`).
- `409 EMAIL_ALREADY_REGISTERED` — el email ya existe.

> Importante: `register` **no** devuelve token. Para obtener sesión, llamar a `/login` después.

---

## 4. POST `/api/v1/auth/login`

Inicia sesión y devuelve un par de tokens.

**Body**

```json
{
  "email": "juan@test.com",
  "password": "password123"
}
```

**200 OK**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "Vf3k...opaque..."
}
```

**Errores**

- `400 VALIDATION_ERROR` — falta email o password, o el email es inválido (con `errors[]`).
- `401 INVALID_CREDENTIALS` — email no registrado o contraseña incorrecta (no distingue cuál, por seguridad).

> El `refreshToken` es **opaco** (no es un JWT), dura 7 días por defecto y se rota en cada uso.

---

## 5. POST `/api/v1/auth/refresh`

Renueva la sesión. Es público: el propio `refreshToken` es la credencial.

**Body**

```json
{
  "refreshToken": "Vf3k...opaque..."
}
```

**200 OK**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...v2",
  "refreshToken": "Xa9p...opaque...v2"
}
```

**Errores**

- `400 VALIDATION_ERROR` — falta `refreshToken` (con `errors[]`).
- `401 INVALID_REFRESH_TOKEN` — token inválido, expirado o ya usado.

> **Rotación:** cada renovación invalida el `refreshToken` anterior de inmediato. El cliente debe reemplazar **ambos** tokens con los que devuelve la respuesta.
>
> **Detección de reuso:** si se presenta un `refreshToken` ya revocado (posible robo), el servidor revoca toda la cadena de esa sesión y el usuario debe volver a iniciar sesión.

---

## 6. POST `/api/v1/auth/logout`

**Headers**

```
Authorization: Bearer <accessToken>
```

**200 OK**

```json
{
  "message": "Sesión cerrada exitosamente"
}
```

**Errores**

- `401 UNAUTHORIZED` — sin header `Authorization` o access token inválido/expirado.

> Importante: el logout es **stateless** sobre el access token. No invalida el refresh token en el servidor; el frontend debe descartar ambos tokens. La revocación server-side del refresh token queda como pendiente (ver sección 11).

---

## 7. GET `/api/v1/health`

Health check del backend y de WebSockets.

**200 OK**

```json
{
  "status": "success",
  "message": "Backend operational & WebSockets ready",
  "timestamp": "2026-09-11T21:27:48.535Z"
}
```

---

## 8. Tokens

**Access token (JWT)**

- Algoritmo: HS256.
- Payload:

```json
{
  "sub": "clx123abc...",
  "email": "juan@test.com"
}
```

- Expiración: `JWT_EXPIRES_IN` (por defecto `15m`).
- Se envía como `Authorization: Bearer <accessToken>` en cada request protegido.

**Refresh token (opaco)**

- String aleatorio de 48 bytes (base64url). No es un JWT.
- El servidor guarda **solo su hash SHA-256**, nunca el token en claro.
- Expiración: `REFRESH_TOKEN_TTL_DAYS` (por defecto `7` días).
- Se rota en cada uso (ver sección 5).

---

## 9. Reglas de seguridad aplicadas

- Contraseñas hasheadas con **bcrypt** (`BCRYPT_SALT_ROUNDS`, por defecto 12). Nunca se devuelve el hash.
- Rate limit solo en `/api/v1/auth`: **100 requests / 15 min por IP**.
- Cabeceras de seguridad vía **helmet**.
- CORS configurable con `CORS_ORIGIN` (default `*` en dev; en prod apuntar al dominio del frontend).

---

## 10. Ejemplo de consumo (TypeScript)

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ApiError {
  error: { code: string; message: string; errors?: { campo: string; mensaje: string }[] };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const { error } = (await res.json()) as ApiError;
    throw new Error(error.message);
  }

  return (await res.json()) as T;
}

export function login(email: string, password: string): Promise<TokenPair> {
  return request<TokenPair>("/auth/login", { email, password });
}

export function refresh(refreshToken: string): Promise<TokenPair> {
  return request<TokenPair>("/auth/refresh", { refreshToken });
}
```

---

## 11. Diferencias con el contrato general

| Tema | Contrato general | Implementación actual |
|------|------------------|------------------------|
| `register` respuesta | `{id, nombre, apellido, email, accessToken}` (auto-login) | `{message, userId}` (sin token) |
| `login` respuesta | `{accessToken, refreshToken}` | Igual |
| `POST /auth/refresh` (con rotación) | Definido | Igual (rotación + detección de reuso) |
| `GET /auth/me` | Definido | No implementado |
| `POST /auth/logout` | No definido | Implementado (pedido por frontend), stateless |
| `errors[]` por campo en 400 | `{errors:[{campo,mensaje}]}` | Igual |
| Código 500 | `INTERNAL_SERVER_ERROR` | Igual |

Pendientes conocidos: `GET /auth/me`, auto-login en `register` y revocación server-side del refresh token en `logout`.

Cualquier cambio en esta tabla debe acordarse en un issue/PR antes de modificar el consumo del frontend.

---

## Changelog

| Fecha | Versión | Cambio |
|-------|---------|--------|
| 2026-09-11 | 0.2.0 | `POST /auth/refresh` con rotación y detección de reuso; `login` devuelve `refreshToken`; `errors[]` en 400; código `INTERNAL_SERVER_ERROR` |
| 2026-09-11 | 0.1.0 | Documento inicial de la API de auth implementada |
