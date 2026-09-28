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

Genera un token GetStream para el usuario autenticado. El `userId` se toma del JWT (`req.user.sub`) y el rol de la DB (`participante.rol`); el body se ignora.

**Auth:** JWT requerido (Bearer token). El usuario debe ser participante **APROBADO** de la sala (`estado = APROBADO`).

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

## Realtime — Socket.IO (namespace `/reuniones`)

Base: `<rootUrl>/reuniones` (sin prefijo `/api/v1`, es un namespace de Socket.IO, no una ruta REST). Auth vía `socket.handshake.auth.token` (JWT de usuario, opcional según el evento).

### Waiting room (contrato v1, en producción)

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `join:request` | C→S | `{ salaCodigo, nombre, apellido, email }` | El participante solicita ingreso. Si el caller tiene JWT válido, `nombre`/`apellido`/`email` se completan **siempre** desde `Usuario` (lo que venga en el payload se ignora). Sin sesión, los tres campos son obligatorios. |
| `join:pending` | S→host | `{ participanteId, nombre, apellido, email, timestamp }` | Se emite a la room `sala:{id}:host` cuando hay una nueva solicitud `PENDIENTE`. |
| `host:subscribe` | C→S | `{ salaId }` | El HOST se suscribe para recibir `join:pending` de su sala. Requiere JWT + ser HOST. **Conocido:** no reenvía las solicitudes `PENDIENTE` ya existentes al momento de suscribirse (ver BUG-06 en `docs/bugs.md`). |
| `participant:approve` | C→S | `{ participanteId }` | Solo el HOST. Resuelve con `update` condicional (`WHERE estado = PENDIENTE`) para evitar doble resolución por carrera. |
| `participant:reject` | C→S | `{ participanteId }` | Ídem, para rechazo. |
| `join:approved` | S→participante | `{ sala: { id, codigo, estado }, streamCallId }` | `streamCallId` es el callCid real de GetStream (ver BUG-05 en `docs/bugs.md`: en la versión actual de `develop` este valor está fabricado y no coincide con el del host — corregido en el PR #85, pendiente de merge). |
| `join:rejected` | S→participante | `{ sala: { id, codigo, estado }, streamCallId: null }` | `streamCallId` siempre `null` en un rechazo. |
| `error` | S→C | `{ code, message }` | Códigos: `UNAUTHORIZED`, `HOST_ONLY`, `ROOM_NOT_FOUND`, `NOT_FOUND`, `PARTICIPANT_STATE_CONFLICT`, `INTERNAL_SERVER_ERROR`. |

Verificado con la suite `.http` (`api_waiting.http`, `npm run test:http`).

### Estado de medios en vivo — S3-09 (⏳ pendiente de merge, PR #84)

Estos eventos **todavía no están en `develop` ni en Render** — se documentan de antemano (mismo criterio que `qa/casos-manuales-us-04-us-07.md`) para que FE pueda integrarlos apenas se mergee el PR. Fuente: `apps/server/src/realtime/participantState.handlers.ts` en `feature/S3-09-estado-mic-cam-pantalla`.

| Evento | Dirección | Payload | Descripción |
|---|---|---|---|
| `room:enter` | C→S | `{ salaCodigo, email?, mic?, cam?, screen? }` | Bindea la identidad del socket (`socket.data.salaId`/`participanteId`) resuelta server-side contra `Participante` — nunca por lo que mande el cliente. Requiere participante `APROBADO`. Devuelve por *replay* el `participant:state` de todos los presentes, para evitar parpadeo. |
| `participant:state` | C→S | `{ mic?, cam?, screen? }` (patch parcial, booleanos) | Actualiza el estado de medios propio. Valores no booleanos se descartan (`sanitizeMediaPatch`). Requiere haber hecho `room:enter` antes. |
| `participant:state` | S→C | `{ participanteId, mic, cam, screen, timestamp }` | Broadcast a toda `sala:{id}` (incluye al emisor). |
| `participant:connection` | S→C | `{ participanteId, connection: "disconnected", timestamp }` | Se emite al desconectarse el último socket de un participante (refcount por pestaña). **Nota:** el tipo contempla `"connected"` también, pero hoy solo se emite `"disconnected"` — la presencia al conectar se infiere del primer `participant:state`. |
| `error` | S→C | `{ code, message }` | Códigos nuevos: `NOT_APPROVED`, `NOT_IN_ROOM`, `VALIDATION_ERROR` (además de los ya listados arriba). |

El estado vive en memoria (`estadoMedio.store.ts`), no se persiste en DB: es un overlay de presencia, no el roster de la sala.

---

## Webhooks

> ⚠️ **Los webhooks NO usan el Base URL de arriba.** Se montan en la raíz
> (`app.use("/webhooks", ...)` en `src/app.ts`), sin el prefijo `/api/v1`.

### POST /webhooks/getstream — GetStream webhook

URL completa: `http://localhost:4000/webhooks/getstream` (sin `/api/v1`).

Recibe eventos de GetStream y marca salas como `FINALIZADA`. Solo `call.ended` finaliza la sala; `call.session_ended` se ignora a propósito (dispara también cuando el host queda momentáneamente solo).

**Verificación de firma HMAC (S3-08):** exigida por defecto vía `WEBHOOK_SIGNATURE_REQUIRED` (`config/env.ts`; default `true` fuera de `development`, falso solo en dev si se lo pisa explícitamente). `apps/server/.env.example` todavía no lista esta variable (ni ninguna otra de webhook) — falta agregarla ahí para que quien clone el repo sepa que existe.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-09-28 | S3-API: agregado `POST /salas/:id/transfer-host` a Swagger (faltaba por completo) y corregido el body de `POST /rooms/:id/token` (ya no exige/documenta `userId`/`role`/`callCid`, el controller los ignora desde S3-08). Nueva sección "Realtime — Socket.IO" con el contrato completo de waiting room (ya en producción) y de estado de medios en vivo S3-09 (⏳ pendiente de merge, PR #84). Nota de HMAC de webhooks actualizada y agregada `WEBHOOK_SIGNATURE_REQUIRED` a `.env.example`. Casos `.http` #30-#37 (`transfer-host` + `rooms/:id/token`) agregados a `api_salas_agenda.http`: 39/39 OK contra `localhost` (misma DB que Render); contra Render se encontró y documentó **BUG-09** (`POST /salas` → 500, bloquea la corrida completa contra ese entorno). |
| 2026-09-24 | Contrato OpenAPI `1.0.1`. Suite `.http` con aserciones (auth, salas, waiting room) y colección Hoppscotch alineada a las rutas vigentes. |
| 2026-09-22 | Documentado en Swagger (`src/docs/openapi.ts` + `/api/v1/docs`) con ejemplos y schemas: `POST /salas`, `GET /salas/:code`, `GET /salas/mis-participaciones` (Agenda). Agregado `api_salas_agenda.http` (REST Client). Ver issue #33. |
| 2026-09-21 | Documento inicial (PR #74): CRUD de salas, participantes, webhook GetStream. |
