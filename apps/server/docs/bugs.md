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
