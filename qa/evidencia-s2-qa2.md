# Evidencia de ejecución — S2-QA2

Tarea: "Correr y extender la suite de API (Hoppscotch + .http) contra los endpoints de salas y aprobación: casos válidos/inválidos, salas expiradas y errores de auth; guardar respuestas como evidencia."

Fecha de ejecución: 2026-09-25, contra el código de `develop` corrido en local (`apps/server`, `npm run dev`, `:4000`). `https://meetflow-server.onrender.com` sigue devolviendo `503 Service Suspended` (mismo bloqueo documentado en `qa/evidencia-s2-qa1.md`), así que no se pudo correr literalmente "contra develop" desplegado; se corrió contra el mismo código que Render serviría si estuviera activo.

## Qué se extendió

- `apps/server/api_salas_agenda.http`: se agregaron los casos 26 a 29 (antes terminaba en el 25):
  - **26–27**: sala creada con `fechaInicio` en el pasado ("expirada") — se crea igual (201) y su código sigue resolviendo (200). Documenta BUG-04.
  - **28**: código con formato inválido (`@@@---123`) → 404 (no distingue "mal formado" de "no encontrado").
  - **29**: `GET /salas/:id/detalle` con un `id` que no es UUID → **500** en vez de 400/404. Nuevo hallazgo: BUG-07.
- `apps/server/api_waiting.http`: se agregaron casos de aprobación/rechazo inválidos dentro del mismo test de Socket.IO, y un caso 7 nuevo:
  - `participant:approve` con un `participanteId` inexistente → `NOT_FOUND`.
  - `participant:approve`/`reject` sin token (socket anónimo) → `UNAUTHORIZED`.
  - `participant:approve`/`reject` por un usuario logueado que no es el host de esa sala → `HOST_ONLY`.
  - Caso 7: `join:request` con payload incompleto (sin nombre/apellido/email) → el servidor no lo rechaza, crea el participante igual. Nuevo hallazgo: BUG-08.

## Resultado

Los 3 archivos corren en verde (52/52 requests/tests):

```
api_auth.http:          14/14 succeeded
api_salas_agenda.http:  31/31 succeeded (incluye 26-29 nuevos)
api_waiting.http:        7/7  succeeded (incluye casos nuevos dentro del test 6, y el 7 nuevo)
```

Nota: "succeeded" en varios de estos casos significa que la aserción confirma el comportamiento **actual real** del backend, incluyendo comportamientos que son bugs documentados (BUG-04, BUG-07, BUG-08). La suite queda verde porque afirma el estado real del sistema, no el ideal; cada aserción de ese tipo tiene un comentario en el `.http` explicando qué cambiar el día que se corrija el bug correspondiente.

Logs completos (salida de `npx httpyac <archivo> --all --output short`):
- `qa/evidencia-s2-qa2-auth.log`
- `qa/evidencia-s2-qa2-salas.log`
- `qa/evidencia-s2-qa2-waiting.log`

## Bugs nuevos encontrados en este ciclo

- **BUG-07** (media): `GET /salas/:id/detalle` con id no-UUID responde 500 en vez de 400/404 — falta validación de formato antes de pegarle a Prisma. Probablemente afecta también a `PUT/DELETE /salas/:id` y `GET /salas/:id/participantes` por compartir el mismo patrón (no se verificó cada uno en este ciclo).
- **BUG-08** (baja): `join:request` (Socket.IO) no valida que el payload traiga `nombre`/`apellido`/`email`; se puede crear un participante `PENDIENTE` con datos vacíos sin que el cliente reciba error.

Detalle completo, severidad y pasos de repro de estos y de los bugs anteriores (BUG-01 a BUG-06) están en `apps/server/docs/bugs.md`.

## Cobertura de casos inválido/expirada/401/403/404 (criterio de aceptación)

| Tipo | Endpoint(s) | Cubierto |
|---|---|---|
| 401 | `POST /salas`, `GET /salas/mis-participaciones`, `GET/PUT/DELETE /salas/:id`, `GET .../participantes`, `participant:approve/reject` (Socket.IO) | Sí |
| 403 | `PUT/DELETE /salas/:id` (invitado), `host:subscribe`/`participant:approve/reject` (no-host) | Sí |
| 404 | `GET /salas/:code`, `GET/PUT/DELETE /salas/:id`, `GET .../participantes`, `join:request` a sala inexistente (`ROOM_NOT_FOUND`) | Sí |
| Inválido (formato/payload) | código con formato raro (28), id no-UUID (29, revela BUG-07), payload de `join:request` incompleto (revela BUG-08) | Sí |
| Sala "expirada" | `fechaInicio` en el pasado (26-27, documenta BUG-04 — no hay expiración real todavía) | Sí, documentado como hueco |
