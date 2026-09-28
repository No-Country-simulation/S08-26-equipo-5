# MeetFlow API — Documentación

Base URL: `http://localhost:4000/api/v1`

📖 **Swagger interactivo:** `GET /api/v1/docs` (UI) · `GET /api/v1/docs.json` (spec crudo) — fuente de verdad con schemas y ejemplos, generado desde `src/docs/openapi.ts`.

🧪 **Suite `.http` (REST Client / httpyac), contrato v1.0.1:** `api_auth.http`, `api_salas_agenda.http` y `api_waiting.http`. Cliente gráfico en el repo: `hoppscotch/meetflow-salas-agenda.json`.

```bash
npm run test:http
```

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

### POST /salas/:id/transfer-host — Transferir rol HOST

Transfiere el rol de HOST a otro participante de la sala. Solo el HOST actual puede transferir. El caller queda como PARTICIPANTE y el target pasa a HOST (se preserva el `estado` de ambos). Cualquier participante existente califica (PENDIENTE o APROBADO).

**Auth:** JWT requerido

**Request body:**
```json
{
  "nuevoHostId": "uuid-del-usuario"
}
```

**Response 200:**
```json
{
  "message": "Rol de HOST transferido exitosamente",
  "host": { "usuarioId": "uuid" },
  "previousHost": { "usuarioId": "uuid" }
}
```

**Errores:**
- 400 — `nuevoHostId` ausente o auto-transferencia
- 403 — Solo el HOST puede transferir el rol
- 404 — Sala no encontrada / nuevo host no es participante de la sala

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

Alias deprecado de `POST /salas/:salaId/stream-token` (ver sección Realtime más
arriba y `docs/JOIN-FLOW.md`) — mismo middleware `authParticipante`, mismo
contrato de respuesta. El `userId`/rol siempre se resuelven contra la DB; el
body se ignora por completo.

**Auth:** `Authorization: Bearer <token>` — puede ser el access token de un usuario registrado o el guest JWT de un participante invitado aprobado.

**Request body:** ignorado (se acepta por compatibilidad, pero `userId`/`role` no se usan).

**Response 200:**
```json
{ "token": "eyJhbGciOi..." }
```

**Errores:**
- 401 — Sin token, sin claim `sub`, expirado o firma inválida
- 403 — El usuario no es participante aprobado de la sala (PENDIENTE/RECHAZADO)
- 404 — Sala no encontrada
- 409 — Sala no sincronizada con GetStream

---

## Realtime — Socket.IO (namespace `/reuniones`)

Base: `<rootUrl>/reuniones` (sin prefijo `/api/v1`, es un namespace de Socket.IO, no
una ruta REST). Handshake opcional `auth: { token }`: acepta el access token de un
usuario registrado **o** el guest JWT que devuelve `POST /salas/:code/join`.

### Ingreso a la sala (join-flow, PR #85)

Contrato completo, con diagramas y ejemplos de cada endpoint HTTP asociado
(`POST /salas/:code/join`, `POST /salas/:salaId/stream-token`,
`GET /salas/:salaId/mi-estado`): **[`docs/JOIN-FLOW.md`](../../../docs/JOIN-FLOW.md)**
(raíz del repo). Guía de integración para `apps/web`:
**[`docs/FRONTEND-GETSTREAM.md`](../../../docs/FRONTEND-GETSTREAM.md)**.

Resumen de eventos:

| Evento | Dirección | Payload | Nota |
|---|---|---|---|
| `join:request` | C→S | `{ salaCodigo, nombre?, apellido?, email? }` | logueado: nombre/apellido/email se ignoran, la identidad sale de la cuenta |
| `join:subscribe` | C→S | `{ participanteId }` | exige ser dueño del participante (socket conectado con su `accessToken`) |
| `host:subscribe` | C→S | `{ salaId }` | requiere access token de HOST |
| `participant:approve` / `participant:reject` | C→S | `{ participanteId }` | update condicional (`WHERE estado = PENDIENTE`); el que pierde la carrera recibe `PARTICIPANT_STATE_CONFLICT` por su ack, no un evento |
| `join:pending` | S→host | `{ participanteId, nombre, apellido, email, timestamp }` | |
| `join:approved` | S→participante | `{ participanteId, accessToken, expiresAt, sala, streamCallId (deprecado), stream: { callType, callId, callCid } }` | |
| `join:rejected` | S→participante | `{ sala, streamCallId: null }` | |
| `room:state` | S→sala y host | `{ salaId, estado, participantes }` | |
| `error` | S→C | `{ code, message }` | `UNAUTHORIZED`, `HOST_ONLY`, `FORBIDDEN`, `NOT_FOUND`, `ROOM_NOT_FOUND`, `VALIDATION_ERROR`, `PARTICIPANT_STATE_CONFLICT`, `INTERNAL_SERVER_ERROR` |

### Estado de medios en vivo (S3-09)

Mic/cam/pantalla y presencia de conexión, en memoria por proceso
(`estadoMedio.store.ts`) — no se persiste en DB, es un overlay de presencia
sobre el roster real de `Participante`.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `room:enter` | C→S | `{ salaCodigo, email?, mic?, cam?, screen? }` | Bindea la identidad del socket resolviéndola server-side contra `Participante` (por email si es invitado, por `socket.data.userId` si está logueado) — nunca por lo que mande el cliente. Requiere estar `APROBADO`. Al entrar, recibe por *replay* el `participant:state` de todos los presentes, para no arrancar en blanco. |
| `participant:state` | C→S | `{ mic?, cam?, screen? }` (patch parcial, booleanos) | Actualiza el estado propio. Valores no booleanos se descartan. Requiere haber hecho `room:enter` antes (si no, `error: NOT_IN_ROOM`). |
| `participant:state` | S→C | `{ participanteId, mic, cam, screen, timestamp }` | Broadcast a toda `sala:{id}` (incluye al emisor). |
| `participant:connection` | S→C | `{ participanteId, connection: "disconnected", timestamp }` | Se emite cuando se va el último socket de ese participante (refcount por pestaña/dispositivo). La presencia al conectar se infiere del primer `participant:state`, no hay un evento `"connected"` explícito hoy. |
| `error` | S→C | `{ code, message }` | Códigos propios: `NOT_APPROVED`, `NOT_IN_ROOM`, `VALIDATION_ERROR` (además de `ROOM_NOT_FOUND`/`INTERNAL_SERVER_ERROR`). |

Consumido por S3-05 (badges de mic/cam/pantalla en el grid de video) y S4-03
(indicador de conexión) sin acoplarse al modelo de `Participante`: alcanza con
escuchar `participant:state`/`participant:connection` en la room `sala:{id}`.

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

Recibe eventos de GetStream y marca salas como `FINALIZADA`. Solo `call.ended`
finaliza la sala; `call.session_ended` se ignora a propósito (dispara también
cuando el host queda momentáneamente solo).

**Verificación de firma HMAC (S3-08):** exigida por defecto vía
`WEBHOOK_SIGNATURE_REQUIRED` (`config/env.ts`; default `true` fuera de
`development`, falso solo en dev si se lo pisa explícitamente). El
`apps/server/.env.example` todavía lista la variable vieja
`WEBHOOK_VERIFY_SIGNATURE` — desactualizado, pendiente de corregir.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-09-28 | S3-09: agregada sección "Realtime — Socket.IO" con el contrato de join-flow (PR #85, ver `docs/JOIN-FLOW.md`) y de estado de medios en vivo (`room:enter`/`participant:state`/`participant:connection`). Corregida la nota de HMAC de webhooks (S3-08 la exige por defecto) y el endpoint legacy `/rooms/:id/token` (alias de `stream-token`, no del viejo contrato con body). |
| 2026-09-24 | Contrato OpenAPI `1.0.1`. Suite `.http` con aserciones (auth, salas, waiting room) y colección Hoppscotch alineada a las rutas vigentes. |
| 2026-09-22 | Documentado en Swagger (`src/docs/openapi.ts` + `/api/v1/docs`) con ejemplos y schemas: `POST /salas`, `GET /salas/:code`, `GET /salas/mis-participaciones` (Agenda). Agregado `api_salas_agenda.http` (REST Client). Ver issue #33. |
| 2026-09-21 | Documento inicial (PR #74): CRUD de salas, participantes, webhook GetStream. |
