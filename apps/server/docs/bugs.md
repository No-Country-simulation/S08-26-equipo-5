# Bugs

Hallazgos de la ejecución S1-QA2 (US-01 a US-03) el 2026-09-24 contra `http://localhost:4000` (`npm run dev`). Evidencia: `qa/evidencia-ejecucion-us-01-us-03.md`.

## BUG-01 — El enlace de la sala no abre el waiting room

- Casos: QA-05
- Severidad: alta
- Dónde: `rooms.controller.ts` arma `enlace` como `{FRONTEND_URL}/sala/{codigo}`. No existe la ruta `apps/web/app/**/sala`. El frontend entra por `/waiting-room?code={codigo}`.
- Efecto: el enlace que devuelve `POST /salas` no lleva al ingreso.
- API relacionada: `GET /api/v1/salas/{codigo}` sí responde 200.

## BUG-02 — El frontend pide un join HTTP que el backend no tiene

- Casos: QA-09, QA-10, QA-11
- Severidad: alta
- Dónde: `apps/web/app/lib/salas-api.ts` `requestSalaJoin` hace `POST /salas/{code}/join`. Esa ruta no está en `rooms.routes.ts`. El contrato real es Socket.IO `/reuniones` (`join:request`, `participant:approve`, `participant:reject`).
- Efecto: desde la UI el participante no queda `PENDIENTE` y el host no puede aprobar ni rechazar. La demo local (`?demo=true`) simula el flujo sin backend.
- El contrato Socket.IO sí cumple esos casos cuando se habla directo al namespace (suite `api_waiting.http`).

## BUG-03 — Crear sala desde el frontend no envía JWT

- Casos: QA-01, QA-03
- Severidad: alta
- Dónde: `createSala()` en `salas-api.ts` hace `POST /salas` sin `Authorization`. El backend exige Bearer y responde 401.
- Efecto: la creación de sala desde la UI queda bloqueada aunque el API con JWT funcione.

## BUG-04 — No hay expiración de enlace

- Casos: QA-08
- Severidad: media
- Dónde: no existe estado `EXPIRED` ni respuesta 410. Un código vigente sigue resolviendo la sala.
- Efecto: el caso de enlace expirado de la matriz no puede pasar. Es un hueco de producto, no un fallo intermitente.
