# MeetFlow API — Documentación

Base URL: `http://localhost:4000/api/v1`

📖 **Swagger interactivo:** `GET /api/v1/docs` (UI) · `GET /api/v1/docs.json` (spec crudo) — fuente de verdad con schemas y ejemplos, generado desde `src/docs/openapi.ts`.

🧪 **Colección `.http` (REST Client):** `apps/server/api_salas_agenda.http` (Salas + Agenda) y `apps/server/api_auth.http` (Auth).

---

## Salas

### POST /salas — Crear sala

Crea una sala con código único y agrega al creador como HOST.

**Auth:** JWT requerido (Bearer token)

**Request body:**
```json
{
  "nombre": "Reunión Q4",
  "resumen": "Opcional",
  "fechaInicio": "2026-10-01T10:00:00Z"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| nombre | string | Sí | Nombre de la sala (max 150 chars) |
| resumen | string | No | Descripción opcional |
| fechaInicio | string (ISO) | No | Si se provee → estado PROGRAMADA. Si se omite → estado ACTIVA |

**Response 201:**
```json
{
  "salaId": "uuid",
  "codigo": "ABCD1234",
  "nombre": "Reunión Q4",
  "enlace": "http://localhost:3000/sala/ABCD1234",
  "streamRoomId": "default:uuid"
}
```

**Errores:**
- 401 — Sin token o token inválido
- 400 — Nombre vacío o mayor a 150 caracteres

---

### GET /salas/:code — Consulta pública de sala

Retorna datos públicos de una sala por su código. No requiere autenticación.

**Response 200:**
```json
{
  "id": "uuid",
  "codigo": "ABCD1234",
  "nombre": "Reunión Q4",
  "resumen": "Descripción",
  "fechaInicio": "2026-10-01T10:00:00.000Z",
  "estado": "PROGRAMADA",
  "totalParticipantes": 3
}
```

**Errores:**
- 404 — Sala no encontrada

---

---

## Agenda

### GET /salas/mis-participaciones — Agenda del usuario

> ⚠️ **Nota histórica (issue #33):** la tarjeta original pedía documentar `GET /agenda`. Durante
> S2-01/S2-03 esa funcionalidad se consolidó en este endpoint (se eliminaron los borradores
> `GET /salas/mis-salas/list` y `GET /salas/programadas/list` del contrato de Hoppscotch). No hay
> una ruta `/agenda` separada: el frontend arma la agenda pidiendo esta lista y filtrando por `rol`
> y `estado`.

Retorna todas las salas donde el usuario autenticado es participante (HOST o PARTICIPANTE). El frontend usa el campo `rol` para filtrar.

**Auth:** JWT requerido

**Response 200:**
```json
{
  "salas": [
    {
      "id": "uuid",
      "codigo": "ABCD1234",
      "nombre": "Reunión Q4",
      "resumen": null,
      "fechaInicio": "2026-10-01T10:00:00.000Z",
      "fechaFin": null,
      "estado": "PROGRAMADA",
      "totalParticipantes": 3,
      "rol": "HOST"
    }
  ]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| rol | string | `"HOST"` o `"PARTICIPANTE"` — usar para filtrar en frontend |

---

### GET /salas/:id/detalle — Detalle de sala

Retorna el detalle completo de una sala con lista de participantes.

**Auth:** JWT requerido

**Response 200:**
```json
{
  "id": "uuid",
  "codigo": "ABCD1234",
  "nombre": "Reunión Q4",
  "resumen": null,
  "fechaInicio": "2026-10-01T10:00:00.000Z",
  "fechaFin": null,
  "estado": "PROGRAMADA",
  "streamRoomId": "default:uuid",
  "enlace": "http://localhost:3000/sala/ABCD1234",
  "totalParticipantes": 3,
  "participantes": [
    {
      "id": "uuid",
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan@test.com",
      "rol": "HOST",
      "estado": "APROBADO",
      "fechaIngreso": "2026-09-21T10:00:00.000Z"
    }
  ],
  "creador": {
    "id": "uuid",
    "nombre": "Juan",
    "apellido": "Pérez",
    "email": "juan@test.com"
  }
}
```

---

### PUT /salas/:id — Actualizar sala

Actualiza nombre, resumen o fecha de una sala. Solo el HOST puede actualizar.

**Auth:** JWT requerido

**Request body:**
```json
{
  "nombre": "Nuevo nombre",
  "resumen": "Nuevo resumen",
  "fechaInicio": "2026-10-02T14:00:00Z"
}
```

**Response 200:**
```json
{
  "id": "uuid",
  "codigo": "ABCD1234",
  "nombre": "Nuevo nombre",
  "resumen": "Nuevo resumen",
  "fechaInicio": "2026-10-02T14:00:00.000Z"
}
```

**Errores:**
- 403 — Solo el HOST puede actualizar
- 404 — Sala no encontrada

---

### DELETE /salas/:id — Cancelar sala

Cancela una sala (cambia estado a CANCELADA). Solo el HOST puede cancelar.

**Auth:** JWT requerido

**Response 200:**
```json
{ "message": "Sala cancelada exitosamente" }
```

**Errores:**
- 403 — Solo el HOST puede cancelar
- 404 — Sala no encontrada
- 400 — Sala ya cancelada o finalizada

---

### GET /salas/:id/participantes — Lista de participantes

Retorna la lista de participantes de una sala.

**Auth:** JWT requerido

**Response 200:**
```json
{
  "salaId": "uuid",
  "salaNombre": "Reunión Q4",
  "total": 3,
  "participantes": [
    {
      "id": "uuid",
      "nombre": "Juan",
      "apellido": "Pérez",
      "email": "juan@test.com",
      "rol": "HOST",
      "estado": "APROBADO",
      "fechaIngreso": "2026-09-21T10:00:00.000Z"
    }
  ]
}
```

---

### POST /rooms/:id/token — Generar token GetStream (legacy)

Genera un token GetStream para un participante.

**Request body:**
```json
{
  "userId": "user-uuid",
  "role": "HOST"
}
```

**Response 200:**
```json
{ "token": "eyJhbGciOi..." }
```

---

## Auth

### POST /auth/register — Registrar usuario

### POST /auth/login — Iniciar sesión

### GET /auth/me — Usuario actual

### POST /auth/refresh — Renovar token

### POST /auth/logout — Cerrar sesión

*Ver detalles en el código fuente de auth.controller.ts*

---

## Health

### GET /health — Health check

**Response 200:**
```json
{
  "status": "success",
  "message": "Backend operativo",
  "timestamp": "2026-09-21T10:00:00.000Z"
}
```

---

## Webhooks

> ⚠️ **Los webhooks NO usan el Base URL de arriba.** Se montan en la raíz
> (`app.use("/webhooks", ...)` en `src/app.ts`), sin el prefijo `/api/v1`.

### POST /webhooks/getstream — GetStream webhook

URL completa: `http://localhost:4000/webhooks/getstream` (sin `/api/v1`).

Recibe eventos de GetStream (call.ended, session_ended) y marca salas como FINALIZADA.

> ⚠️ **Nota de seguridad**: la verificación de firma HMAC (`X-Signature`) está
> implementada en `webhook.controller.ts` pero actualmente **comentada/deshabilitada**
> para desarrollo. Antes de producción hay que descomentarla (ver TODO en el código).

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-09-22 | Documentado en Swagger (`src/docs/openapi.ts` + `/api/v1/docs`) con ejemplos y schemas: `POST /salas`, `GET /salas/:code`, `GET /salas/mis-participaciones` (Agenda). Agregado `api_salas_agenda.http` (REST Client). Ver issue #33. |
| 2026-09-21 | Documento inicial (PR #74): CRUD de salas, participantes, webhook GetStream. |
