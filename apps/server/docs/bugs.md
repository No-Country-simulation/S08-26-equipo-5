# Bugs

Hallazgos de la ejecución S1-QA2 (US-01 a US-03) el 2026-09-24 contra `http://localhost:4000` (`npm run dev`). Evidencia: `qa/evidencia-ejecucion-us-01-us-03.md`.
Re-verificados el 2026-09-25 en S2-QA1 contra el código actual de `develop` (Render/`develop` suspendido, ver `qa/evidencia-s2-qa1.md`).
Cierre S4-QA3 (2026-10-01, rama `QA-Sprint4`): evidencia en `qa/evidencia-s4-qa3.md`.

## BUG-01 — El enlace de la sala no abre el waiting room

- Casos: QA-05
- Severidad: media (bajó de alta: la app ya no depende de este campo para navegar)
- Estado: **corregido** (S4-QA3, 2026-10-01). Retest contra `https://web-ruddy-mu-22.vercel.app/sala/QA-S4`: 307 a `/waiting-room?code=QA-S4` y esa página responde 200. La ruta es `apps/web/app/(platform)/sala/[codigo]/page.tsx`.
- Dónde (histórico): `rooms.controller.ts` arma `enlace` como `{FRONTEND_URL}/sala/{codigo}`. No existía la ruta `apps/web/app/**/sala`.
- Efecto: si un host copia y comparte el campo `enlace` fuera de la app (ej. por WhatsApp), ese link da 404. Dentro de la app ya no es un bloqueante porque el flujo de creación/unión (PR #82) navega directo a `/waiting-room?code=` y `/room?code=`, sin usar ese campo.
- API relacionada: `GET /api/v1/salas/{codigo}` sí responde 200.
- Nota (branch `feature/join-flow-stream-token`): el backend mantiene el enlace `/sala/{codigo}` (según lo acordado en la PR); el frontend es quien debe agregar esa ruta.

## BUG-02 — El frontend pide un join HTTP que el backend no tiene — RESUELTO

- Casos: QA-09, QA-10, QA-11
- Severidad: alta
- Estado: resuelto en `feature/join-flow-stream-token`. El backend ahora expone `POST /salas/:code/join` (HTTP, además del contrato Socket.IO existente): acepta invitados anónimos o logueados, crea/reusa el `Participante` en `PENDIENTE` y devuelve `accessToken` (guest JWT) cuando corresponde. Ver `docs/JOIN-FLOW.md`.
- Pendiente en el frontend: `salas-api.ts` debe pegarle a esta ruta nueva y, con el `accessToken` recibido, conectar el socket de `/reuniones` para recibir `join:approved`/`join:rejected` (el servidor autosuscribe al socket que trae ese guest JWT).
- Dónde (histórico): `apps/web/app/lib/salas-api.ts` `requestSalaJoin` hacía `POST /salas/{code}/join`, ruta que no estaba en `rooms.routes.ts`. El contrato Socket.IO (`join:request`, `participant:approve`, `participant:reject`) sigue vigente y cubierto por `api_waiting.http`.
- Estado: **corregido** (PR #82, "integrate authentication, room access and realtime meetings"). Re-verificado en vivo: el waiting room ahora emite `join:request` por Socket.IO y el host recibe la solicitud en tiempo real, sin 404.

## BUG-03 — Crear sala desde el frontend no envía JWT

- Estado: **corregido** (PR #82). Re-verificado en vivo: `createSala()` ahora usa el helper `request()` que agrega `Authorization: Bearer` cuando hay sesión, y la creación de sala funciona end-to-end desde la UI logueada.

## BUG-04 — No hay expiración de enlace

- Casos: QA-08
- Severidad: media
- Estado: **won't fix** (S4-QA3, 2026-10-01). `fechaInicio` es el inicio programado de la sala, no un vencimiento del enlace. No hay regla de producto para un estado `EXPIRED` ni para un 410. El código sigue resolviendo mientras la sala no esté cancelada o finalizada. Los casos 26 y 27 de `api_salas_agenda.http` documentan ese comportamiento aceptado.
- Dónde: no existe estado `EXPIRED` ni respuesta 410. Una sala creada con `fechaInicio` en el pasado se crea (201) y su código sigue resolviendo.
- Efecto: el caso de enlace expirado de la matriz no puede pasar. Es un hueco de producto, no un fallo intermitente.

## BUG-05 — El participante aprobado se conecta a una call de GetStream distinta a la del host

- Casos: QA-10 (US-03)
- Severidad: **alta**
- Estado: **corregido**. Retest S4-QA3 (2026-10-01): `waiting-room.test.ts` → "emite el callId REAL, no uno derivado del código de sala" en verde (`streamCallId` es el de la sala, no `call_<codigo>`). El participante ya no entra a `/room` con un callId fabricado: `getStreamToken` devuelve el call persistido. No se repitió la videollamada de dos personas en Render porque crear sala sigue en 500 (BUG-09).
- Dónde (histórico): al aprobar, `join:approved` mandaba `streamCallId: call_${sala.codigo.toLowerCase()}`, distinto del `streamRoomId` real (`default:<uuid>`). Hoy `buildJoinApprovedPayload` usa `getStreamCallRef(sala)`.
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
- Estado: **corregido** (S4-QA3, 2026-10-01). `assertUuid` rechaza el id antes de Prisma con 400 `VALIDATION_ERROR` en detalle, update, delete, finalizar, transfer-host, participantes, invitaciones y `authParticipante`. Retest: `uuid.test.ts` en verde. El caso 29 de `api_salas_agenda.http` ahora espera 400. Contra Render sigue el 500 viejo hasta que se despliegue este commit.
- Dónde: `apps/server/src/controllers/rooms.controller.ts` (`getSalaDetalle`), pasa `req.params.id` directo a `prisma.sala.findUnique({ where: { id } })` sin validar que sea un UUID válido antes.
- Pasos de reproducción:
  1. `GET /api/v1/salas/no-es-un-uuid/detalle` con un JWT válido.
  2. Prisma lanza una excepción al intentar castear `"no-es-un-uuid"` a UUID en la query.
  3. El error handler global no distingue este caso y devuelve `500 INTERNAL_SERVER_ERROR` genérico.
- Efecto: un id mal formado (typo, id de otra entidad, etc.) se reporta como error de servidor en vez de un 400/404 claro. Es probable que el mismo patrón afecte a otras rutas `:id` de `rooms.controller.ts` (`PUT/DELETE /salas/:id`, `GET /salas/:id/participantes`) ya que comparten el mismo estilo de acceso a Prisma sin validar formato antes — no se verificaron todas en este ciclo.
- Fix sugerido: validar `id` con una regex/`zod` de UUID antes de la consulta y devolver 400 si no matchea, o envolver el `findUnique` y mapear el error de Prisma (`P2023` - malformed ID) a 404.

## BUG-08 — `join:request` (Socket.IO) no valida el payload — RESUELTO

- Casos: suite `.http` `api_waiting.http` #13
- Severidad: baja
- Estado: resuelto en `feature/join-flow-stream-token` (`eee4209`): `waitingRoom.service.ts` valida nombre/apellido/email y el socket recibe `error` con `code: "VALIDATION_ERROR"`. El caso #13 de `api_waiting.http` quedó como regresión. Encontrado en S2-QA2, 2026-09-25.
- Dónde: `apps/server/src/realtime/waitingRoom.handlers.ts`, handler de `join:request` usa `payload.nombre/apellido/email` sin validar que existan.
- Efecto: se puede crear un participante `PENDIENTE` sin nombre/apellido/email (o con valores `undefined`), sin que el cliente reciba ningún error. El host vería una solicitud con datos vacíos en el panel de "Solicitudes de ingreso".
- Fix sugerido: validar el payload (por ejemplo con `zod`) al inicio del handler y emitir un `error` con `code: "VALIDATION_ERROR"` si faltan campos, igual que ya se hace para los demás códigos de error de este namespace.

## BUG-06 — El panel del host pierde las solicitudes pendientes al reconectar

- Casos: QA-10 (US-03)
- Severidad: media
- Estado: **corregido** (S4-QA3, 2026-10-01). `host:subscribe` reenvía `join:pending` de cada `PENDIENTE` solo al socket que reconecta. Retest: `waitingRoom.handlers.test.ts` → "reenvía join:pending de los PENDIENTE de la sala solo a este socket". El panel del host además hidrata por `GET /salas/:id/participantes`. No se repitió la recarga en Render (BUG-09).
- Dónde (histórico): `host:subscribe` solo hacía `socket.join(...)` y no reenviaba los `PENDIENTE` ya existentes.
- Pasos de reproducción:
  1. Participante solicita ingreso (`join:request`) y queda `PENDIENTE`.
  2. Antes de que el host la apruebe/rechace, el host recarga la pestaña de `/room` (o pierde y recupera la conexión de Socket.IO).
  3. El panel "Solicitudes de ingreso" muestra "Sin solicitudes pendientes", aunque en la base de datos el participante sigue en estado `PENDIENTE`.
- Efecto: el host no ve solicitudes legítimas que ya estaban esperando; el participante queda esperando indefinidamente sin ningún error visible, salvo que vuelva a enviar la solicitud.
- Fix sugerido: al recibir `host:subscribe`, consultar los participantes `PENDIENTE` de la sala y emitir `join:pending` por cada uno antes de unir el socket a la room.

## BUG-09 — `POST /salas` responde 500 en Render (creación de sala rota)

- Casos: suite `.http` `api_salas_agenda.http` #5 y #30 (S3-API, tarea de documentación Swagger/`.http` para S3-08/S3-09)
- Severidad: **crítica** — bloquea cualquier flujo que dependa de crear una sala (todo lo posterior: transfer-host, join, waiting room, medios en vivo) contra el entorno público.
- Estado: **abierto** (encontrado el 2026-09-28, corriendo la suite `.http` contra `https://meetflow-server-tm9i.onrender.com`).
- Dónde: reproducido de dos formas independientes contra Render — con `npx httpyac api_salas_agenda.http --all` (host apuntado temporalmente a Render) y con `curl` puro (register → login → `POST /salas`), mismo resultado en ambos casos.
- Pasos de reproducción:
  1. `POST /api/v1/auth/register` + `POST /api/v1/auth/login` contra `https://meetflow-server-tm9i.onrender.com` → 201/200 OK (auth funciona bien).
  2. `POST /api/v1/salas` con el JWT válido y `{ "nombre": "..." }` → `500 { "error": { "code": "INTERNAL_SERVER_ERROR", "message": "Ocurrió un error interno" } }`.
  3. `GET /api/v1/health` y `GET /api/v1/salas/:code` (lectura pública) sí responden bien (200/404 según corresponda) — el problema es específico del **path de escritura** de `createSala`.
- **Aislado:** se corrió la suite completa `api_salas_agenda.http` (39 requests) levantando el server local (`npm run dev`) contra el **mismo** `DATABASE_URL` (Neon) que usa Render — resultado `39 requests processed (39 succeeded)`, incluyendo `POST /salas` en 201. Esto descarta la base de datos como causa: el problema es específico del entorno de ejecución de Render (env vars o egress de red hacia GetStream), no de los datos ni del código en sí (el mismo código, mismo commit, misma DB, funciona en local).
- Hipótesis de causa: `createSala` en `rooms.controller.ts` llama a `createRoomService` (`stream.service.ts`, `call.getOrCreate` de GetStream) **antes** de la transacción Prisma. Si `GETSTREAM_API_KEY`/`GETSTREAM_API_SECRET` no están seteadas (o son distintas/inválidas) en el entorno de Render, o si Render bloquea el egress hacia la API de GetStream, `createRoom` relanza el error envuelto en un `Error` genérico, que el error-handler global mapea a 500 sin distinguirlo de otras fallas.
- Efecto sobre esta tarea (S3-API): no se pudo completar el criterio de aceptación "`.http` actualizados y corridos contra el entorno Render" para los casos nuevos de `transfer-host` (#30-#37) — no hay forma de crear una sala en Render para probarlos. Quedan agregados al `.http` y **verificados 39/39 contra `localhost`** con la misma DB de Render; contra Render en sí solo se pudo reproducir y documentar este bug.
- Fix sugerido: revisar en el dashboard de Render que `GETSTREAM_API_KEY`/`GETSTREAM_API_SECRET` estén seteadas y coincidan con las de GetStream Dashboard, y loguear el mensaje real de `createRoom` (hoy se pierde en el error-handler genérico) para confirmar la causa exacta antes de asumir más.
- Re-verificado el 2026-10-01 en S4-QA1 (rama `QA-Sprint4`, `develop` @ `73d8291`) contra `https://meetflow-server-tm9i.onrender.com`. Sigue **abierto**: `POST /api/v1/salas` responde 500 `INTERNAL_SERVER_ERROR` en `api_salas_agenda.http` #5, #26 y #30, y también en `api_invitaciones.http` #5 y `api_waiting.http` #5. Auth (`api_auth.http`) quedó 14/14 en verde en la misma corrida. Evidencia: `qa/evidencia-s4-qa1.md`.
- Decisión S4-QA3: **no se cierra**. `GETSTREAM_API_KEY` es obligatoria al boot y el health responde 200, así que el proceso tiene la variable. El cuerpo del 500 es el del error no manejado (`{ error: { code, message } }`), no el de `StreamServiceError` del código actual. Junto con BUG-10, el servicio público no está corriendo este `develop`. Hace falta redesplegar Render y repetir `POST /salas`. No hay acceso al dashboard desde esta corrida.

## BUG-10 — El Render desplegado no sirve las rutas de invitaciones

- Casos: suite `.http` `api_invitaciones.http` #13 y #14 (S4-QA1)
- Severidad: **alta** — el contrato de invitaciones de `develop` (`GET/POST /api/v1/invitaciones/:token`) no está en el proceso que atiende el entorno público.
- Estado: **abierto** (encontrado el 2026-10-01, `QA-Sprint4`, contra `https://meetflow-server-tm9i.onrender.com`).
- Dónde: `apps/server/src/app.ts` responde 404 `NOT_FOUND` / "Recurso no encontrado" cuando ninguna ruta matchea. En el código de `develop` @ `73d8291` esas rutas existen (`invitaciones.routes.ts`) y un token desconocido debe responder **410** `INVITATION_INVALID`, no el 404 genérico.
- Pasos de reproducción:
  1. `GET /api/v1/invitaciones/token-que-no-existe` contra Render.
  2. Respuesta real: `404 { "error": { "code": "NOT_FOUND", "message": "Recurso no encontrado" } }`.
  3. `POST /api/v1/invitaciones/token-que-no-existe/aceptar` con JWT válido da el mismo 404 genérico.
- Efecto: no se puede cerrar el flujo de invitación por correo contra el entorno deployado. El caso #8 (`POST /salas/:id/invitaciones` a un id inexistente → 404) queda en falso verde: el status coincide, pero no se pudo distinguir de "la ruta no está montada" porque crear sala falla antes (BUG-09) y no hay sala real para contrastar.
- Fix sugerido: confirmar en el dashboard de Render que el servicio redesplegó `develop` después del merge `73d8291` (PR #104). Si el deploy está al día, revisar que el proceso en ejecución sea el build que monta `invitacionesRoutes`.
- Decisión S4-QA3: **no se cierra**. No es un defecto del código de `develop` (las rutas están en `app.ts`). Es un deploy atrasado. Sin acceso al hook de Render no se puede redesplegar ni retestear desde esta rama.
