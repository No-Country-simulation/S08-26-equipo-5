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

| HTTP | `code` | Cuándo ocurre |
|------|--------|---------------|
| 400 | `VALIDATION_ERROR` | Body inválido o campos faltantes |
| 401 | `INVALID_CREDENTIALS` | Email o contraseña incorrectos en login |
| 401 | `UNAUTHORIZED` | Falta el header `Authorization` o el token es inválido/expirado |
| 404 | `NOT_FOUND` | Ruta inexistente |
| 409 | `EMAIL_ALREADY_REGISTERED` | El email ya está registrado |
| 500 | `INTERNAL_ERROR` | Error inesperado del servidor |

---

## 2. Resumen de endpoints

| Método | Ruta | Auth | Éxito |
|--------|------|------|-------|
| POST | `/api/v1/auth/register` | No | 201 |
| POST | `/api/v1/auth/login` | No | 200 |
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
  "message": "User registered successfully",
  "userId": "clx123abc..."
}
```

**Errores**

- `400 VALIDATION_ERROR` — falta algún campo o no cumple las reglas.
- `409 EMAIL_ALREADY_REGISTERED` — el email ya existe.

> Importante: `register` **no** devuelve token. Para obtener sesión, llamar a `/login` después.

---

## 4. POST `/api/v1/auth/login`

Inicia sesión y devuelve un access token.

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
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errores**

- `400 VALIDATION_ERROR` — falta email o password, o el email es inválido.
- `401 INVALID_CREDENTIALS` — email no registrado o contraseña incorrecta (no distingue cuál, por seguridad).

---

## 5. POST `/api/v1/auth/logout`

**Headers**

```
Authorization: Bearer <accessToken>
```

**200 OK**

```json
{
  "message": "Logout successful"
}
```

**Errores**

- `401 UNAUTHORIZED` — sin header `Authorization` o token inválido/expirado.

> Importante: el logout es **stateless**. El token no se invalida en el servidor; el frontend debe descartarlo (borrarlo de memoria/localStorage). Si el token se filtra, sigue siendo válido hasta su expiración.

---

## 6. GET `/api/v1/health`

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

## 7. Token JWT

- Algoritmo: HS256.
- Payload:

```json
{
  "sub": "clx123abc...",
  "email": "juan@test.com"
}
```

- Expiración: configurable por `JWT_EXPIRES_IN` (por defecto `8h`).
- El frontend debe enviarlo como `Authorization: Bearer <accessToken>` en cada request protegido.

---

## 8. Reglas de seguridad aplicadas

- Contraseñas hasheadas con **bcrypt** (`BCRYPT_SALT_ROUNDS`, por defecto 12). Nunca se devuelve el hash.
- Rate limit solo en `/api/v1/auth`: **100 requests / 15 min por IP**.
- Cabeceras de seguridad vía **helmet**.
- CORS configurable con `CORS_ORIGIN` (default `*` en dev; en prod apuntar al dominio del frontend).

---

## 9. Ejemplo de consumo (TypeScript)

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface ApiError {
  error: { code: string; message: string };
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const { error } = (await res.json()) as ApiError;
    throw new Error(error.message);
  }

  const { accessToken } = (await res.json()) as { accessToken: string };
  return accessToken;
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
```

---

## 10. Diferencias con el contrato general

El contrato general no contemplaba la tarea de auth al momento de escribirse. Estos son los puntos **pendientes de decisión de equipo** (no bloquean el consumo actual):

| Tema | Contrato general | Implementación actual |
|------|------------------|------------------------|
| `register` respuesta | `{id, nombre, apellido, email, accessToken}` (auto-login) | `{message, userId}` (sin token) |
| `login` respuesta | `{accessToken, refreshToken}` | `{accessToken}` |
| `GET /auth/me` | Definido | No implementado |
| `POST /auth/refresh` (con rotación) | Definido | No implementado |
| `POST /auth/logout` | No definido | Implementado (pedido por frontend) |
| `errors[]` por campo en 400 | `{errors:[{campo,mensaje}]}` | Solo `message` |
| Código 500 | `INTERNAL_SERVER_ERROR` | `INTERNAL_ERROR` |

Cualquier cambio en esta tabla debe acordarse en un issue/PR antes de modificar el consumo del frontend.

---

## Changelog

| Fecha | Versión | Cambio |
|-------|---------|--------|
| 2026-09-11 | 0.1.0 | Documento inicial de la API de auth implementada |
