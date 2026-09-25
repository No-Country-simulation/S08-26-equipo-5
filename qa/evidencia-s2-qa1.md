# Evidencia de ejecución — S2-QA1

Tarea: "Ejecutar los casos manuales diseñados en S1-QA2 contra el entorno develop: creación de sala, ingreso por enlace y waiting room con approve/reject; registrar evidencias y bugs en tarjetas propias."

Fecha de ejecución: 2026-09-25.

## Entorno

- **Develop (Render) no disponible**: `https://meetflow-server.onrender.com/api/v1/health` responde `503 Service Suspended` al momento de esta ejecución. No es posible correr los casos "contra develop" tal como pide el enunciado hasta que alguien con acceso reactive el servicio en el dashboard de Render.
- Por ese motivo, esta ejecución se hizo contra el código de la rama `develop` corrido en local (`apps/server` con `npm run dev` en `:4000`, `apps/web` con `npm run dev` en `:3000`), que es el mismo código que Render serviría si estuviera activo. `develop` está al día con `origin/develop` (incluye los PRs #78, #80, #81 y #82 ya mergeados).
- Usuario de prueba: `qahost-s2@example.com` (creado vía `POST /auth/register`, sin datos reales).

## Resultado por caso

| Caso | Qué se probó | Resultado | Evidencia |
|---|---|---|---|
| QA-01 (crear sala, US-01) | Login real por UI + `POST /salas` con JWT desde el navegador | **PASS** — antes fallaba por BUG-03 (ya corregido en PR #82) | `screenshots/s2-qa1/qa01-crear-sala-con-jwt-ok.png` |
| QA-09 (solicitar ingreso, US-03) | Participante completa formulario en `/waiting-room?code=...` y solicita ingreso | **PASS** — antes fallaba por BUG-02 (ya corregido, ahora usa Socket.IO `join:request` en vez del `POST /salas/{code}/join` inexistente) | `qa09-waiting-room-formulario-listo.png`, `qa09-esperando-aprobacion.png` |
| QA-10 (aprobar, US-03) | Host ve la solicitud en tiempo real y aprueba | **PASS parcial** — la aprobación llega y redirige al participante, pero ver BUG-05 abajo | `qa10-host-panel-solicitud-pendiente.png` |
| QA-11 (rechazar, US-03) | Host rechaza una segunda solicitud | **PASS** — el participante recibe "Ingreso rechazado" en tiempo real | `qa11-host-panel-antes-de-rechazar.png`, `qa11-participante-rechazado.png` |
| QA-05 (enlace, US-02) | Se probó si el campo `enlace` devuelto por `POST /salas` lleva al waiting room | **FAIL parcial** — ver BUG-01 (persiste, con matiz) |  |
| QA-08 (enlace expirado, US-02) | Crear sala con `fechaInicio` en el pasado y verificar que el código deje de resolver | **FAIL** — BUG-04 persiste, sin cambios |  |

## Hallazgos nuevos de esta ejecución

- **BUG-01 y BUG-04 siguen abiertos**, sin cambios respecto a S1-QA2 (ver `apps/server/docs/bugs.md`).
- **BUG-02 y BUG-03 quedaron confirmados como corregidos** por el PR #82 ("integrate authentication, room access and realtime meetings"), verificado end-to-end con navegador real (no solo lectura de código).
- **BUG-05 (nuevo, severidad alta)**: el `streamCallId` que el backend manda al participante aprobado (`call_${codigo.toLowerCase()}`, hardcodeado en `waitingRoom.handlers.ts`) es distinto al `streamRoomId` real de GetStream que usa el host (`default:<uuid>`, el que devolvió `POST /salas`). Un participante aprobado queda esperando indefinidamente en "Preparando conexión…" en una call de GetStream que no es la del host: nunca se ven ni escuchan. Ver `bug05-participante-aprobado-callid-distinto.png`.
- **BUG-06 (nuevo, severidad media)**: si el host recarga la página de la sala (`/room`) mientras hay una solicitud `PENDIENTE` sin resolver, esa solicitud desaparece del panel de "Solicitudes de ingreso" — el evento `host:subscribe` no reenvía las solicitudes pendientes existentes al reconectar, solo las nuevas que lleguen después. El participante queda esperando sin que el host la vea, y si el participante también recarga su propia pestaña pierde su estado y debe reenviar la solicitud manualmente.
- Hallazgo menor (no bloqueante, dev-only): overlay de error de hidratación de React visible en `/waiting-room` en el modo de desarrollo de Next.js (`app/(platform)/waiting-room/page.tsx:500`). No se investigó a fondo el causante ya que no afecta producción (`next build`) ni bloquea el flujo funcional.

## Privacidad

Las capturas de este set nunca muestran contenido real de webcam: la cámara se apagó explícitamente antes de cada captura final (se ve "Cámara apagada" en las de "Vos"). Los emails/nombres usados son de prueba, no datos reales de usuarios.
