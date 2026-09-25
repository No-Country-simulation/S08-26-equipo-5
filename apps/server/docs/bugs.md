# Bugs

Hallazgos de la ejecución S1-QA2 (US-01 a US-03) el 2026-09-24 contra `http://localhost:4000` (`npm run dev`). Evidencia: `qa/evidencia-ejecucion-us-01-us-03.md`.
Re-verificados el 2026-09-25 en S2-QA1 contra el código actual de `develop` (Render/`develop` suspendido, ver `qa/evidencia-s2-qa1.md`).

## BUG-01 — El enlace de la sala no abre el waiting room

- Casos: QA-05
- Severidad: media (bajó de alta: la app ya no depende de este campo para navegar)
- Estado: **abierto**, sin cambios en el backend.
- Dónde: `rooms.controller.ts` arma `enlace` como `{FRONTEND_URL}/sala/{codigo}`. No existe la ruta `apps/web/app/**/sala`.
- Efecto: si un host copia y comparte el campo `enlace` fuera de la app (ej. por WhatsApp), ese link da 404. Dentro de la app ya no es un bloqueante porque el flujo de creación/unión (PR #82) navega directo a `/waiting-room?code=` y `/room?code=`, sin usar ese campo.
- API relacionada: `GET /api/v1/salas/{codigo}` sí responde 200.

## BUG-02 — El frontend pide un join HTTP que el backend no tiene

- Estado: **corregido** (PR #82, "integrate authentication, room access and realtime meetings"). Re-verificado en vivo: el waiting room ahora emite `join:request` por Socket.IO y el host recibe la solicitud en tiempo real, sin 404.

## BUG-03 — Crear sala desde el frontend no envía JWT

- Estado: **corregido** (PR #82). Re-verificado en vivo: `createSala()` ahora usa el helper `request()` que agrega `Authorization: Bearer` cuando hay sesión, y la creación de sala funciona end-to-end desde la UI logueada.

## BUG-04 — No hay expiración de enlace

- Casos: QA-08
- Severidad: media
- Estado: **abierto**, sin cambios.
- Dónde: no existe estado `EXPIRED` ni respuesta 410. Un código vigente sigue resolviendo la sala. Confirmado de nuevo: una sala creada con `fechaInicio` en 2020 sigue devolviendo 201 y su código sigue resolviendo normalmente.
- Efecto: el caso de enlace expirado de la matriz no puede pasar. Es un hueco de producto, no un fallo intermitente.

## BUG-05 — El participante aprobado se conecta a una call de GetStream distinta a la del host

- Casos: QA-10 (US-03)
- Severidad: **alta**
- Estado: **abierto** (encontrado en S2-QA1, 2026-09-25).
- Dónde: `apps/server/src/realtime/waitingRoom.handlers.ts:113`. Al aprobar (`participant:approve`), el evento `join:approved` manda `streamCallId: call_${sala.codigo.toLowerCase()}` — un valor fabricado en el momento, que **no** es el `streamRoomId` real de GetStream que la sala tiene desde que se creó (`POST /salas` devuelve `streamRoomId: "default:<uuid>"`, y es ese el que usa el host en `/room`).
- Pasos de reproducción:
  1. Loguearse como host y crear una sala (`POST /salas` devuelve, p. ej., `streamRoomId: "default:9501c4f1-..."`).
  2. Entrar como host a `/room?...&callId=default:9501c4f1-...`.
  3. En otra sesión, ir a `/waiting-room?code=<codigo>`, completar el formulario y solicitar ingreso.
  4. Desde el host, aprobar la solicitud.
  5. El participante es redirigido a `/room?code=<codigo>&callId=call_<codigo_en_minusculas>` — un Call ID distinto al del host.
- Efecto: el participante aprobado nunca se conecta a la misma videollamada que el host (queda en "Preparando conexión…" indefinidamente). El flujo de aprobación funciona a nivel de estado/UI, pero la reunión real (audio/video) no se establece.
- Fix sugerido: en `resolveParticipant`, usar `participante.sala.streamRoomId` (agregándolo al `include`/`select` de la consulta si falta) en vez de fabricar el string.

## BUG-07 — `GET /salas/:id/detalle` con id mal formado responde 500 en vez de 400/404

- Casos: suite `.http` `api_salas_agenda.http` #29
- Severidad: media
- Estado: **abierto** (encontrado en S2-QA2, 2026-09-25).
- Dónde: `apps/server/src/controllers/rooms.controller.ts` (`getSalaDetalle`), pasa `req.params.id` directo a `prisma.sala.findUnique({ where: { id } })` sin validar que sea un UUID válido antes.
- Pasos de reproducción:
  1. `GET /api/v1/salas/no-es-un-uuid/detalle` con un JWT válido.
  2. Prisma lanza una excepción al intentar castear `"no-es-un-uuid"` a UUID en la query.
  3. El error handler global no distingue este caso y devuelve `500 INTERNAL_SERVER_ERROR` genérico.
- Efecto: un id mal formado (typo, id de otra entidad, etc.) se reporta como error de servidor en vez de un 400/404 claro. Es probable que el mismo patrón afecte a otras rutas `:id` de `rooms.controller.ts` (`PUT/DELETE /salas/:id`, `GET /salas/:id/participantes`) ya que comparten el mismo estilo de acceso a Prisma sin validar formato antes — no se verificaron todas en este ciclo.
- Fix sugerido: validar `id` con una regex/`zod` de UUID antes de la consulta y devolver 400 si no matchea, o envolver el `findUnique` y mapear el error de Prisma (`P2023` - malformed ID) a 404.

## BUG-08 — `join:request` (Socket.IO) no valida el payload

- Casos: suite `.http` `api_waiting.http` #7
- Severidad: baja
- Estado: **abierto** (encontrado en S2-QA2, 2026-09-25).
- Dónde: `apps/server/src/realtime/waitingRoom.handlers.ts`, handler de `join:request` usa `payload.nombre/apellido/email` sin validar que existan.
- Efecto: se puede crear un participante `PENDIENTE` sin nombre/apellido/email (o con valores `undefined`), sin que el cliente reciba ningún error. El host vería una solicitud con datos vacíos en el panel de "Solicitudes de ingreso".
- Fix sugerido: validar el payload (por ejemplo con `zod`) al inicio del handler y emitir un `error` con `code: "VALIDATION_ERROR"` si faltan campos, igual que ya se hace para los demás códigos de error de este namespace.

## BUG-06 — El panel del host pierde las solicitudes pendientes al reconectar

- Casos: QA-10 (US-03)
- Severidad: media
- Estado: **abierto** (encontrado en S2-QA1, 2026-09-25).
- Dónde: `apps/server/src/realtime/waitingRoom.handlers.ts:56` (`host:subscribe`) solo hace `socket.join(...)`, no reenvía las solicitudes `PENDIENTE` que ya existan para esa sala.
- Pasos de reproducción:
  1. Participante solicita ingreso (`join:request`) y queda `PENDIENTE`.
  2. Antes de que el host la apruebe/rechace, el host recarga la pestaña de `/room` (o pierde y recupera la conexión de Socket.IO).
  3. El panel "Solicitudes de ingreso" muestra "Sin solicitudes pendientes", aunque en la base de datos el participante sigue en estado `PENDIENTE`.
- Efecto: el host no ve solicitudes legítimas que ya estaban esperando; el participante queda esperando indefinidamente sin ningún error visible, salvo que vuelva a enviar la solicitud.
- Fix sugerido: al recibir `host:subscribe`, consultar los participantes `PENDIENTE` de la sala y emitir `join:pending` por cada uno antes de unir el socket a la room.
