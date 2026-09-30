# MeetFlow API — Documentación

Base URL: `http://localhost:4000/api/v1`

📖 **Swagger interactivo:** `GET /api/v1/docs` (UI) · `GET /api/v1/docs.json` (spec crudo) — fuente de verdad con schemas y ejemplos, generado desde `src/docs/openapi.ts`.

🧪 **Suite `.http` (REST Client / httpyac), contrato v1.0.1:** `api_auth.http`, `api_salas_agenda.http`, `api_waiting.http` y `api_usuarios.http`. Cliente gráfico en el repo: `hoppscotch/meetflow-salas-agenda.json`.

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

Transfiere el rol de HOST a otro participante de la sala. Solo el HOST actual puede transferir. El caller queda como PARTICIPANTE y el target pasa a HOST (se preserva el `estado` de ambos).

> ⚠️ **Contrato de `nuevoHostId` cambiado (2026-09-30):** ya **no** es el `usuarioId`, es el
> `Participante.id` de la sala — el mismo valor que usa GetStream como `userId` dentro de la
> llamada. Además ahora **solo califican participantes con cuenta registrada** (`usuarioId != null`);
> un invitado sin cuenta no puede ser HOST. La sincronización de roles en GetStream (ver abajo)
> depende de este cambio.

**Auth:** JWT requerido

**Request body:**
```json
{
  "nuevoHostId": "participante-id (no usuarioId)"
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

**Efecto en GetStream:** además de actualizar la DB, sincroniza los roles en la llamada real vía
API secret (`addCallMember`): el nuevo host queda con rol `admin` en GetStream (puede finalizar/
expulsar) y el anterior pasa a `user`. Sin esto, el nuevo host quedaría "HOST" solo en la DB pero
sin permisos reales en la videollamada.

**Errores:**
- 400 — `nuevoHostId` ausente o auto-transferencia
- 403 — Solo el HOST puede transferir el rol
- 404 — Sala no encontrada / el target no es participante de la sala o no tiene cuenta registrada

---

### POST /salas/:id/finalizar — Finalizar sala explícitamente

Cambia el estado de la sala a `FINALIZADA` y emite `room:ended` por el namespace `/reuniones`
(ver sección Realtime) para redirigir a los clientes conectados, sin depender del webhook de
GetStream. Pensado como fallback cuando el webhook no llega — típicamente en desarrollo local,
donde el server no tiene una URL pública a la que GetStream le pueda pegar. Solo el HOST puede
finalizar. Idempotente: si la sala ya estaba `FINALIZADA`, responde 200 igual.

**Auth:** JWT requerido

**Response 200:**
```json
{ "message": "Sala finalizada exitosamente" }
```

**Errores:**
- 401 — No autenticado
- 403 — Solo el HOST puede finalizar la sala
- 404 — Sala no encontrada

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
      "fechaIngreso": "2026-09-21T10:00:00.000Z",
      "fotoUrl": "https://res.cloudinary.com/.../v1759230000/meetflow/avatars/uuid.jpg"
    }
  ]
}
```

`fotoUrl` es la foto de la cuenta vinculada (`null` para invitados sin cuenta o usuarios sin foto). El mismo campo se agrega a cada participante de `GET /salas/:id/detalle`.

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
| `join:pending` | S→host | `{ participanteId, nombre, apellido, email, fotoUrl, timestamp }` | `fotoUrl`: foto de la cuenta vinculada o `null` |
| `join:approved` | S→participante | `{ participanteId, accessToken, expiresAt, sala, streamCallId (deprecado), stream: { callType, callId, callCid } }` | |
| `join:rejected` | S→participante | `{ sala, streamCallId: null }` | |
| `room:state` | S→sala y host | `{ salaId, estado, participantes }` | cada participante: `{ id, nombre, estado, fotoUrl }` (`fotoUrl` null si no tiene) |
| `room:ended` | S→sala | `{ salaId, estado: "FINALIZADA", fechaFin }` | Emitido por `POST /salas/:id/finalizar` (fallback explícito cuando no llega el webhook de GetStream). Los clientes deben usarlo para redirigir fuera de la sala. |
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

**Response 200:** `{ "id", "nombre", "apellido", "email", "fotoUrl" }` — `fotoUrl` es `null` si el usuario no subió foto.

### POST /auth/refresh — Renovar token

### POST /auth/logout — Cerrar sesión

*Ver detalles en el código fuente de auth.controller.ts*

---

## Usuarios — foto de perfil

La imagen pasa por el backend y se guarda en Cloudinary (recorte 256x256 centrado en la cara). Sin `CLOUDINARY_URL` solo `PUT` responde `503 UPLOADS_NOT_CONFIGURED`; `DELETE` sigue funcionando (limpia la base y omite el borrado remoto). El resto del servidor funciona igual. Cada subida usa un identificador opaco (UUID) en Cloudinary, sin el id del usuario; la foto anterior se borra tras guardar la nueva.

### PUT /usuarios/me/foto — Subir o reemplazar

**Auth:** JWT requerido · **Content-Type:** `multipart/form-data` con el campo `foto` (JPEG, PNG o WebP; máx. `AVATAR_MAX_BYTES`, 2 MB por defecto). El tipo se valida por magic bytes: el mimetype/extensión que declare el cliente se ignora.

```bash
curl -X PUT http://localhost:4000/api/v1/usuarios/me/foto \
  -H "Authorization: Bearer <jwt>" -F "foto=@avatar.jpg"
```

**Response 200:** `{ "fotoUrl": "https://res.cloudinary.com/<cloud>/image/upload/v<version>/meetflow/avatars/<usuarioId>.jpg" }` — la URL lleva la versión, así que cambia al reemplazar la foto (cache busting).

| Status | `error.code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | No se envió archivo, el campo no se llama `foto` ("Se requiere una imagen") o el cuerpo multipart está mal formado (truncado, sin boundary) |
| 401 | `UNAUTHORIZED` | Token ausente, inválido o expirado |
| 413 | `FILE_TOO_LARGE` | Supera `AVATAR_MAX_BYTES` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | El contenido no es JPEG/PNG/WebP |
| 429 | `RATE_LIMITED` | Más de `RATE_LIMIT_AVATAR_MAX` (10) operaciones de foto por usuario cada 15 min |
| 502 | `UPLOAD_FAILED` | Falló Cloudinary |
| 503 | `UPLOADS_NOT_CONFIGURED` | Falta `CLOUDINARY_URL` |

### DELETE /usuarios/me/foto — Quitar

**Auth:** JWT requerido · **Response 204** sin body. Idempotente (204 aunque no hubiera foto). Si el borrado en Cloudinary falla igual se limpia la base (se loguea un warning). Funciona también sin `CLOUDINARY_URL` (no hay borrado remoto). Errores: 401, 429 (mismos códigos que arriba); nunca 503.

### Dónde se ve la foto

- `GET /auth/me`, `GET /salas/:id/participantes`, `GET /salas/:id/detalle`, y los eventos `join:pending` / `room:state`: campo `fotoUrl`.
- GetStream: al pedir el token de la llamada se sincroniza como `image` del usuario (avatar en video y chat). La foto nueva (o su baja) se refleja en GetStream recién en el próximo `stream-token` que pida el participante.

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `CLOUDINARY_URL` | — (opcional) | `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Contiene el secret: no loguear ni commitear |
| `CLOUDINARY_FOLDER` | `meetflow/avatars` | Carpeta en Cloudinary |
| `AVATAR_MAX_BYTES` | `2097152` | Tamaño máximo de la imagen (entero positivo) |
| `RATE_LIMIT_AVATAR_MAX` | `10` | Operaciones de foto por usuario cada 15 min |

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
`development`, falso solo en dev si se lo pisa explícitamente). Ya corregido
en `apps/server/.env.example` (ver changelog).

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-09-30 | Foto de perfil: `PUT`/`DELETE /usuarios/me/foto` (subida vía backend a Cloudinary), `fotoUrl` en `GET /auth/me`, participantes (REST y sockets) y avatar en GetStream. Suite `api_usuarios.http`. |
| 2026-09-30 | PR #101 (Ezequiel): agregado `POST /salas/:id/finalizar` (fallback explícito al webhook de GetStream) y evento `room:ended`. **Cambio de contrato en `transfer-host`:** `nuevoHostId` pasó de ser `usuarioId` a ser `Participante.id` (el `userId` que usa GetStream), y ahora solo califican participantes con cuenta registrada; se agregó sincronización de roles en GetStream (`addCallMember`) para que el nuevo host tenga permisos reales en la llamada, no solo en la DB. Doc actualizada acá porque el PR no tocó Swagger/API.md — quedaba desalineada con el código. |
| 2026-09-29 | S3-API: agregado `POST /salas/:id/transfer-host` a Swagger (faltaba por completo) y corregido el body de `POST /rooms/:id/token` (ya no exige/documenta `userId`/`role`/`callCid`, el controller los ignora desde S3-08). Corregido `apps/server/.env.example`: `WEBHOOK_SIGNATURE_REQUIRED` es la variable real que lee el código, no `WEBHOOK_VERIFY_SIGNATURE`. Casos `.http` #30-#37 (`transfer-host` + `rooms/:id/token`) agregados a `api_salas_agenda.http`: 39/39 OK contra `localhost` (misma DB que Render); contra Render se encontró y documentó **BUG-09** (`POST /salas` → 500, bloquea la corrida completa contra ese entorno). |
| 2026-09-28 | S3-09: agregada sección "Realtime — Socket.IO" con el contrato de join-flow (PR #85, ver `docs/JOIN-FLOW.md`) y de estado de medios en vivo (`room:enter`/`participant:state`/`participant:connection`). Corregida la nota de HMAC de webhooks (S3-08 la exige por defecto) y el endpoint legacy `/rooms/:id/token` (alias de `stream-token`, no del viejo contrato con body). |
| 2026-09-24 | Contrato OpenAPI `1.0.1`. Suite `.http` con aserciones (auth, salas, waiting room) y colección Hoppscotch alineada a las rutas vigentes. |
| 2026-09-22 | Documentado en Swagger (`src/docs/openapi.ts` + `/api/v1/docs`) con ejemplos y schemas: `POST /salas`, `GET /salas/:code`, `GET /salas/mis-participaciones` (Agenda). Agregado `api_salas_agenda.http` (REST Client). Ver issue #33. |
| 2026-09-21 | Documento inicial (PR #74): CRUD de salas, participantes, webhook GetStream. |
