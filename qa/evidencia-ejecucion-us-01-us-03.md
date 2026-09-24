# Evidencia de ejecución S1-QA2 (US-01 a US-03)

## Identificación

- Fecha: 2026-09-24
- Entorno: API local de desarrollo, `http://localhost:4000` (`npm run dev` en `apps/server`).
  **El entorno develop sí tiene URL pública** (`https://meetflow-server.onrender.com`, ver
  `docs/DEPLOY.md`, se despliega en cada push a `develop`), pero al momento de esta corrida
  el servicio devuelve `503 Service Suspended` — está suspendido en el dashboard de Render,
  no inexistente. Por eso la ejecución se hizo contra local; hay que reactivarlo en Render
  para poder correr esta suite contra develop de verdad.
- Runner: `npx httpyac` sobre `api_salas_agenda.http` y `api_waiting.http`
- Logs: [evidencia-s1-qa2-salas.log](evidencia-s1-qa2-salas.log) (27/27) y [evidencia-s1-qa2-waiting.log](evidencia-s1-qa2-waiting.log) (6/6)
- Screenshots: [screenshots/](screenshots/) — `qa01-home-crear-reunion.png`,
  `bug03-crear-sin-jwt.png`, `qa07-waiting-room-codigo-invalido.png`,
  `qa05-waiting-room-codigo-valido.png`, `bug02-solicitar-ingreso-404.png`
- Bugs: [../apps/server/docs/bugs.md](../apps/server/docs/bugs.md)

Se agregaron 5 capturas reales del frontend (`qa/screenshots/`) evidenciando: la pantalla de
creación de reunión, el error real "Token ausente, inválido o expirado" al crear sala sin JWT
(BUG-03), el waiting room con código inválido (QA-07), el waiting room con código válido listo
para solicitar ingreso (QA-05), y el error real "Recurso no encontrado" al solicitar ingreso
(BUG-02, `POST /salas/{code}/join` no existe). No hay video: el flujo de approve/reject
requiere dos clientes Socket.IO simultáneos (host + participante) y no se pudo grabar en esta
corrida; queda pendiente para una sesión con dos personas o dos pestañas coordinadas.

## Resultado por caso

| Caso | US | Resultado | Evidencia |
|---|---|---|---|
| QA-01 Crear sala activa | US-01 | PASS | `POST /salas` con JWT → 201, `salaId` y `codigo` |
| QA-02 Sala programada | US-01 | PASS | El mismo `POST` envía `fechaInicio` futura y responde 201. El controller persiste `PROGRAMADA` cuando viene fecha. |
| QA-03 Permiso denegado al crear | US-01 | PASS | Sin token → 401 `UNAUTHORIZED` |
| QA-04 Datos inválidos | US-01 | PASS | Sin nombre → 400. Nombre de 151 caracteres → 400 |
| QA-05 Ingreso por enlace | US-02 | PASS en API / FAIL en UI | `GET /salas/{codigo}` → 200. El enlace `/sala/{codigo}` no tiene página. Ver BUG-01 |
| QA-06 Código en minúsculas | US-02 | PASS | `GET` con el código en minúsculas → 200 |
| QA-07 Código inválido | US-02 | PASS | `GET /salas/ZZZZ0000` → 404 |
| QA-08 Enlace expirado | US-02 | FAIL | No hay regla de expiración. Ver BUG-04 |
| QA-09 Quedar pendiente | US-03 | PASS en socket / FAIL en UI | `join:request` emite `join:pending`. La UI llama `POST /salas/{code}/join`, que no existe. Ver BUG-02 |
| QA-10 Approve | US-03 | PASS en socket / FAIL en UI | `participant:approve` → `join:approved` con `streamCallId` |
| QA-11 Reject | US-03 | PASS en socket / FAIL en UI | `participant:reject` → `join:rejected` y `streamCallId` null |
| QA-12 Permiso denegado | US-03 | PASS en socket | Sin token → `UNAUTHORIZED`. Invitado en `host:subscribe` → `HOST_ONLY` |
| QA-13 Sala inexistente | US-03 | PASS en socket | `join:request` con código inválido → `ROOM_NOT_FOUND` |
| QA-14 Doble resolución | US-03 | PASS en socket | Segundo reject → `PARTICIPANT_STATE_CONFLICT` |

## Cierre

Los 14 casos se ejecutaron al 100% (contrato de backend HTTP + Socket.IO, con evidencia de log
y captura). El contrato pasa salvo QA-08 (expiración de enlace, no implementada). El recorrido
de usuario en el navegador queda bloqueado por BUG-01, BUG-02 y BUG-03, con captura real de
cada bloqueo en `qa/screenshots/`. Esos bugs están en `apps/server/docs/bugs.md`; falta
linkearlos manualmente desde la tarjeta de GitHub/Trello (fuera del alcance de este repo).
