# MeetFlow API — Documentación

Base URL: `http://localhost:4000/api/v1`

📖 **Swagger interactivo:** `GET /api/v1/docs` (UI) · `GET /api/v1/docs.json` (spec crudo) — fuente de verdad con schemas y ejemplos, generado desde `src/docs/openapi.ts`.

🧪 **Suite `.http` (REST Client / httpyac), contrato v1.0.1:** `api_auth.http`, `api_salas_agenda.http`, `api_waiting.http` y `api_invitaciones.http`. Cliente gráfico en el repo: `hoppscotch/meetflow-salas-agenda.json`.

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

**Visibilidad (PR #104):** solo puede consultar quien es HOST o un participante **no `INVITADO`** vinculado a su cuenta; si no → `403 NOT_A_PARTICIPANT`. El HOST ve todas las filas (incluidos los `INVITADO`) con su `email`. Cualquier otro participante **no ve las filas `INVITADO`** y recibe `email: null` en todas las filas (también en `creador.email`); `total`/`totalParticipantes` cuentan solo las filas visibles.

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

**Visibilidad (PR #104):** solo puede consultar quien es HOST o un participante **no `INVITADO`** vinculado a su cuenta; si no → `403 NOT_A_PARTICIPANT`. El HOST ve todas las filas (incluidos los `INVITADO`) con su `email`. Cualquier otro participante **no ve las filas `INVITADO`** y recibe `email: null` en todas las filas (también en `creador.email`); `total`/`totalParticipantes` cuentan solo las filas visibles.

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

## Invitaciones por correo

El host invita a 1..20 emails; cada invitado recibe un enlace `FRONTEND_URL/invitacion/<token>`. El token es opaco (32 bytes aleatorios), **solo viaja por correo**: la API nunca lo devuelve y en base de datos solo se guarda su hash SHA-256. Vigencia: `INVITACION_TTL_HORAS` (72 h por defecto). El correo sale por el `MailPort` según `MAIL_PROVIDER` (`console` por defecto: loguea sin red; `resend`: requiere `RESEND_API_KEY`; `brevo`: requiere `BREVO_API_KEY`; remitente `MAIL_FROM`, ver "Configurar Brevo" abajo).

### Configurar Brevo (enviar a cualquier destinatario sin dominio propio)

1. Crear una cuenta gratis en https://www.brevo.com.
2. Verificar el remitente (Senders & IP): puede ser un Gmail; Brevo envía un código de 6 dígitos a ese correo.
3. Crear una API key (SMTP & API > API Keys).
4. En el `.env` del server: `MAIL_PROVIDER=brevo`, `BREVO_API_KEY=<tu key>` y `MAIL_FROM` con el remitente verificado (`MeetFlow <tu@gmail.com>` o solo el email).

Limitaciones: el plan gratis permite 300 correos/día. Sin un dominio autenticado, Brevo reescribe el From a `@brevosend.com`, lo que aumenta la chance de caer en spam. Recomendado a largo plazo: dominio propio autenticado (SPF/DKIM) en Brevo o Resend.

### Limitaciones conocidas

- **Rate limiting en memoria, por proceso.** `express-rate-limit` usa su store en memoria (por defecto): los contadores viven en cada proceso, se pierden al reiniciar y **no se comparten entre instancias**. Con N instancias detrás de un balanceador el límite efectivo es hasta N veces mayor. Para un despliegue multi-instancia hace falta un store compartido (p. ej. Redis con `rate-limit-redis`). Hoy el backend corre en una sola instancia, por lo que el comportamiento es el esperado.

### Variables de entorno de invitaciones

| Variable | Default | Descripción |
|----------|---------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | Base de los enlaces que arma el backend: `FRONTEND_URL/invitacion/<token>` (correo) y `FRONTEND_URL/sala/<codigo>` (`enlace` de la sala). **Debe apuntar al front de cada entorno**: si queda en el default, los correos de producción llevarían a `localhost`. |
| `MAIL_PROVIDER` | `console` | `console` (loguea el correo, sin red), `resend` o `brevo`. Un valor desconocido falla al arrancar. |
| `MAIL_FROM` | `onboarding@resend.dev` | Remitente. Con Brevo debe ser un sender verificado. **Caveat Resend sandbox:** `onboarding@resend.dev` solo entrega al email dueño de la cuenta de Resend; para invitar a terceros hace falta un dominio verificado (o usar Brevo). |
| `RESEND_API_KEY` | — | Obligatoria solo con `MAIL_PROVIDER=resend`. |
| `BREVO_API_KEY` | — | Obligatoria solo con `MAIL_PROVIDER=brevo`. |
| `INVITACION_TTL_HORAS` | `72` | Vigencia del enlace de invitación (entero positivo). |
| `RATE_LIMIT_INVITE_MAX` | `30` | Máx. de `POST /salas/:id/invitaciones` por host cada 15 min. |
| `RATE_LIMIT_TOKEN_MAX` | `30` | Máx. de `GET /invitaciones/:token` + `POST /invitaciones/:token/aceptar` por IP cada 15 min. |

Estado nuevo de participante: `INVITADO` (invitado que todavía no aceptó; `nombre`/`apellido` pueden ser `null`). Nunca es aprobable directamente ni aparece entre los aprobados.

### POST /salas/:id/invitaciones — Invitar por correo

Solo el HOST de la sala. Los emails se normalizan (trim + minúsculas) y se deduplican. Los correos se envían **después** de persistir; si el envío falla no se revierte nada y el resultado marca `emailEnviado: false` (se puede reinvitar).

**Auth:** JWT requerido (host)

**Request body:**
```json
{ "emails": ["ana@example.com", "luis@example.com"] }
```

**Response 200:**
```json
{
  "resultados": [
    { "email": "ana@example.com", "estado": "INVITADO", "emailEnviado": true },
    { "email": "luis@example.com", "estado": "YA_PARTICIPA", "emailEnviado": false }
  ]
}
```

`estado` por email: `INVITADO` (invitación nueva), `REENVIADO` (ya estaba invitado; se rota el token y el enlace anterior deja de valer), `YA_PARTICIPA` (ya es participante de la sala: no se crea ni envía nada). Ningún campo revela si el email tiene cuenta.

**Errores:**
- 400 — `VALIDATION_ERROR`: `emails` vacío, con más de 20 o con formato inválido (sin efectos)
- 401 — Sin JWT
- 403 — `HOST_ONLY`
- 404 — `ROOM_NOT_FOUND`
- 409 — `ROOM_CANCELLED` / `ROOM_FINISHED`
- 429 — `RATE_LIMITED` (`RATE_LIMIT_INVITE_MAX` por host cada 15 min)

---

### GET /invitaciones/:token — Vista previa de invitación

Público. No consume el token (se puede consultar varias veces). Sirve a la UI para decidir entre pedir nombre/apellido o pedir login.

**Response 200:**
```json
{
  "sala": { "id": "uuid", "nombre": "Reunión Q4" },
  "email": "a***@example.com",
  "requiereDatos": true,
  "requiereLogin": false
}
```

`email` viene **enmascarado** (endpoint público): primera letra de la parte local + `***` + dominio completo (`ana@example.com` → `a***@example.com`). Nunca se devuelve el email completo; sirve solo para que la UI confirme "estás aceptando como a***@example.com".

`requiereDatos` es `true` si el invitado no tiene cuenta; `requiereLogin` es `true` si la tiene.

**Errores:**
- 410 — `INVITATION_INVALID`: token desconocido, vencido, ya usado o de una sala cerrada. Un único código para todos los casos (evita que se pueda distinguir entre ellos probando tokens).
- 429 — `RATE_LIMITED` (`RATE_LIMIT_TOKEN_MAX` por IP cada 15 min)

---

### POST /invitaciones/:token/aceptar — Aceptar invitación

Sesión **opcional** (`Authorization: Bearer <access token>`). Pasa al invitado de `INVITADO` a `PENDIENTE` (el host lo aprueba como a cualquier otro), avisa al host por `join:pending` y devuelve la misma forma que `POST /salas/:code/join` (más `salaCodigo` para armar la URL de la sala de espera). Consumo **atómico y de un solo uso**: de N aceptaciones concurrentes solo una triunfa. El token nunca se devuelve.

**Invitado sin cuenta** — body obligatorio; el `email` del body (si viene) se ignora, vale el de la invitación:
```json
{ "nombre": "Ana", "apellido": "Pérez" }
```

**Invitado con cuenta** — exige el JWT de **esa** cuenta; el body se ignora por completo (nombre/apellido salen de la cuenta).

**Invitado sin cuenta que acepta logueado** — si vino JWT pero la invitación no estaba ligada a ninguna cuenta, se compara el email de la cuenta del JWT (leído de la DB por `sub`, sin distinguir mayúsculas) con el email invitado. Si coincide: se **vincula** la fila a esa cuenta (`usuarioId`), `nombre`/`apellido` salen de la cuenta y el body se ignora. Si no coincide: `403 INVITATION_ACCOUNT_MISMATCH` y el token **no** se consume (todo se valida antes de consumir; el vínculo y el consumo van en la misma transacción atómica). Si esa cuenta ya es otro participante de la sala: `409 ALREADY_PARTICIPANT`.

**Response 200:**
```json
{
  "participanteId": "uuid",
  "estado": "PENDIENTE",
  "salaId": "uuid",
  "salaCodigo": "ABCD1234",
  "accessToken": "<guest jwt>"
}
```

**Errores:**
- 400 — `VALIDATION_ERROR`: falta `nombre`/`apellido` (invitado sin cuenta). El token **no** se consume.
- 401 — `LOGIN_REQUIRED`: la invitación es de una cuenta registrada y no vino JWT.
- 403 — `INVITATION_ACCOUNT_MISMATCH`: el JWT es de otra cuenta (invitación de una cuenta registrada, o invitación por email cuyo destinatario no coincide con el email de la cuenta logueada). El token **no** se consume.
- 409 — `ALREADY_PARTICIPANT`: la cuenta logueada ya es otro participante de la sala. El token **no** se consume.
- 410 — `INVITATION_INVALID`: token desconocido, vencido, ya usado, carrera perdida o sala cerrada (un único código, sin oráculo). Se evalúa antes que 400/401/403.
- 429 — `RATE_LIMITED` (`RATE_LIMIT_TOKEN_MAX` por IP cada 15 min)

**Ingreso por código:** un `INVITADO` que llama `POST /salas/:code/join` (o el socket `join:request`) con su email también se promueve a `PENDIENTE` reutilizando su fila (sin duplicar) y su invitación queda usada. Si la fila es de una cuenta registrada y el caller no tiene sesión de esa cuenta → `401 LOGIN_REQUIRED`.

**Guardas:** `participant:approve/reject` solo actúan sobre `PENDIENTE` (sobre un `INVITADO`, `409 PARTICIPANT_STATE_CONFLICT`); `POST /salas/:id/transfer-host` rechaza un `INVITADO` como destino (`400`). `GET /salas/:id/participantes` y `/detalle` lo listan con `estado: "INVITADO"` (y `nombre`/`apellido` `null` si es un invitado sin cuenta) **solo al HOST**; el resto de los participantes no ve las filas `INVITADO` ni los emails (`email: null`). Las listas de aprobados no lo incluyen.

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
| `join:pending` | S→host | `{ participanteId, nombre, apellido, email, timestamp }` | `nombre`/`apellido` son `string \| null` (`null` si es un invitado por correo que aún no completó datos; no se rellenan con el email). `email` siempre presente. |
| `join:approved` | S→participante | `{ participanteId, accessToken, expiresAt, sala, streamCallId (deprecado), stream: { callType, callId, callCid } }` | |
| `join:rejected` | S→participante | `{ sala, streamCallId: null }` | |
| `room:state` | S→sala y host | `{ salaId, estado, participantes }` | |
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
`development`, falso solo en dev si se lo pisa explícitamente). Ya corregido
en `apps/server/.env.example` (ver changelog).

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-09-30 | PR #101 (Ezequiel): agregado `POST /salas/:id/finalizar` (fallback explícito al webhook de GetStream) y evento `room:ended`. **Cambio de contrato en `transfer-host`:** `nuevoHostId` pasó de ser `usuarioId` a ser `Participante.id` (el `userId` que usa GetStream), y ahora solo califican participantes con cuenta registrada; se agregó sincronización de roles en GetStream (`addCallMember`) para que el nuevo host tenga permisos reales en la llamada, no solo en la DB. Doc actualizada acá porque el PR no tocó Swagger/API.md — quedaba desalineada con el código. |
| 2026-09-29 | S3-API: agregado `POST /salas/:id/transfer-host` a Swagger (faltaba por completo) y corregido el body de `POST /rooms/:id/token` (ya no exige/documenta `userId`/`role`/`callCid`, el controller los ignora desde S3-08). Corregido `apps/server/.env.example`: `WEBHOOK_SIGNATURE_REQUIRED` es la variable real que lee el código, no `WEBHOOK_VERIFY_SIGNATURE`. Casos `.http` #30-#37 (`transfer-host` + `rooms/:id/token`) agregados a `api_salas_agenda.http`: 39/39 OK contra `localhost` (misma DB que Render); contra Render se encontró y documentó **BUG-09** (`POST /salas` → 500, bloquea la corrida completa contra ese entorno). |
| 2026-09-29 | Invitaciones por correo: `POST /salas/:id/invitaciones`, `GET /invitaciones/:token` y `POST /invitaciones/:token/aceptar` (estado `INVITADO`, `nombre`/`apellido` nullables en participantes). Suite `api_invitaciones.http`. |
| 2026-09-28 | S3-09: agregada sección "Realtime — Socket.IO" con el contrato de join-flow (PR #85, ver `docs/JOIN-FLOW.md`) y de estado de medios en vivo (`room:enter`/`participant:state`/`participant:connection`). Corregida la nota de HMAC de webhooks (S3-08 la exige por defecto) y el endpoint legacy `/rooms/:id/token` (alias de `stream-token`, no del viejo contrato con body). |
| 2026-09-24 | Contrato OpenAPI `1.0.1`. Suite `.http` con aserciones (auth, salas, waiting room) y colección Hoppscotch alineada a las rutas vigentes. |
| 2026-09-22 | Documentado en Swagger (`src/docs/openapi.ts` + `/api/v1/docs`) con ejemplos y schemas: `POST /salas`, `GET /salas/:code`, `GET /salas/mis-participaciones` (Agenda). Agregado `api_salas_agenda.http` (REST Client). Ver issue #33. |
| 2026-09-21 | Documento inicial (PR #74): CRUD de salas, participantes, webhook GetStream. |
