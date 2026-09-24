# Casos manuales QA: US-01 a US-03

## Alcance

Casos para creación de sala, ingreso mediante enlace/código y waiting room con aprobación o rechazo. La ejecución backend se respalda con la suite de Vitest del servidor y con una corrida manual (`httpyac`) sobre `api_salas_agenda.http` y `api_waiting.http`, incluyendo los casos Socket.IO con dos clientes conectados (ver `qa/evidencia-ejecucion-us-01-us-03.md`).

## Datos y precondiciones

- Backend disponible desde `apps/server`.
- Base de datos y variables de entorno configuradas.
- Usuario host registrado, con JWT vigente y rol `HOST` en la sala.
- Usuario participante de prueba: `Ana Perez`, `ana@example.com`.
- Para casos de enlace, conservar el `codigo` devuelto por `POST /api/v1/salas`.
- Para casos realtime, conectar participante y host al namespace `/reuniones`.

## Convenciones de resultado

- **PASS**: comportamiento verificado (suite Vitest o ejecución manual con `httpyac`/Socket.IO, ver `qa/evidencia-ejecucion-us-01-us-03.md`).
- **PASS en API/socket / FAIL en UI**: el contrato backend cumple, pero el recorrido end-to-end desde el frontend no funciona (ver bug asociado en `apps/server/docs/bugs.md`).
- **FAIL**: el comportamiento esperado no se cumple, sea por bug de FE/BE o por falta de implementación.
- **NOT IMPLEMENTED**: la matriz exige el estado, pero no hay regla backend que lo produzca.

## Casos de prueba

| ID | Historia | Caso | Pasos principales | Resultado esperado | Resultado / evidencia |
|---|---|---|---|---|---|
| QA-01 | US-01 | Crear sala activa | Con JWT válido, enviar `POST /api/v1/salas` con `{"nombre":"Sala QA"}`. | `201`; devuelve `salaId`, `codigo`, `nombre`, `enlace` y `streamRoomId`. El host queda aprobado. | **PASS**. `salas.test.ts`: creación con JWT. |
| QA-02 | US-01 | Crear sala programada | Con JWT válido, enviar `POST /api/v1/salas` con `nombre` y `fechaInicio` futura. | `201`; sala con estado `PROGRAMADA`, código único y enlace utilizable. | **PASS**. Ejecutado con `httpyac` sobre `api_salas_agenda.http` (ver `qa/evidencia-ejecucion-us-01-us-03.md`): `POST` con `fechaInicio` futura responde `201` y persiste `PROGRAMADA`. |
| QA-03 | US-01 | Permiso denegado al crear | Repetir QA-01 sin `Authorization` y con JWT inválido. | `401`, código `UNAUTHORIZED`; no se crea sala ni sala Stream. | **PASS**. Suite backend cubre ambos casos. |
| QA-04 | US-01 | Datos inválidos al crear | Enviar `nombre` vacío y luego un nombre de 151 caracteres, con JWT válido. | `400`; mensaje refiere a `nombre` y a límite `150`; no se llama a GetStream. | **PASS**. Suite backend cubre ambos casos. |
| QA-05 | US-02 | Ingresar con enlace/código válido | Usar el `codigo` de QA-01 y enviar `GET /api/v1/salas/{codigo}`. Continuar a waiting room con ese código. | `200`; devuelve datos públicos de la sala y permite cargar waiting room. | **PASS en API / FAIL en UI**. `GET /api/v1/salas/{codigo}` → `200`. El enlace `/sala/{codigo}` no tiene página en el frontend (BUG-01 en `apps/server/docs/bugs.md`). |
| QA-06 | US-02 | Código en minúsculas | Enviar `GET /api/v1/salas/{codigo-en-minusculas}`. | `200`; el backend normaliza el código a mayúsculas y devuelve la sala. | **PASS**. Suite backend cubre normalización. |
| QA-07 | US-02 | Enlace/código inválido | Enviar `GET /api/v1/salas/NOEXISTE`. | `404`; mensaje `Sala no encontrada`; no se muestra una sala inexistente. | **PASS**. Suite backend cubre el caso. |
| QA-08 | US-02 | Enlace expirado | Usar un enlace cuya fecha de vigencia haya terminado. | La matriz requiere rechazo controlado, idealmente `410` o error equivalente, sin acceso a la sala. | **FAIL / NOT IMPLEMENTED**. El backend no aplica expiración de enlaces ni define un estado `EXPIRED` (BUG-04); registrar como gap de producto antes de cerrar este caso. |
| QA-09 | US-03 | Solicitar ingreso y quedar pendiente | Conectar participante al namespace `/reuniones`; emitir `join:request` con `salaCodigo`, nombre, apellido y email. Host conectado y suscripto. | Se crea participante `PENDIENTE`; host recibe `join:pending`; participante permanece esperando. | **PASS en socket / FAIL en UI**. `join:request` emite `join:pending` correctamente (ver `qa/evidencia-ejecucion-us-01-us-03.md`). La UI llama `POST /salas/{code}/join`, que no existe en backend (BUG-02). |
| QA-10 | US-03 | Host aprueba solicitud | Desde el host, emitir `participant:approve` con `participanteId` pendiente. | Participante recibe `join:approved`, `streamCallId` no nulo y puede ingresar a la sala; se emite `room:state`. | **PASS en socket / FAIL en UI**. `participant:approve` → `join:approved` con `streamCallId`. Bloqueado en UI por BUG-02. |
| QA-11 | US-03 | Host rechaza solicitud | Crear una solicitud pendiente y emitir `participant:reject` desde el host. | Participante recibe `join:rejected`; `streamCallId` es `null`; no ingresa a la sala y puede solicitar nuevamente según FE. | **PASS en socket / FAIL en UI**. `participant:reject` → `join:rejected` con `streamCallId` null. Bloqueado en UI por BUG-02. |
| QA-12 | US-03 | Permiso denegado en waiting room | Intentar `host:subscribe`, `participant:approve` y `participant:reject` sin JWT y con JWT de usuario no host. | Evento `error` con `UNAUTHORIZED` para token ausente/inválido y `HOST_ONLY` para usuario sin rol host. No cambia el estado del participante. | **PASS en socket**. Sin token → `UNAUTHORIZED`; invitado en `host:subscribe` → `HOST_ONLY`. Ejecutado con `api_waiting.http`. |
| QA-13 | US-03 | Solicitud sobre sala inexistente | Emitir `join:request` con un `salaCodigo` inexistente. | Evento `error` con `ROOM_NOT_FOUND` y mensaje `No existe una sala con ese código`. | **PASS en socket**. `join:request` con código inválido → `ROOM_NOT_FOUND`. |
| QA-14 | US-03 | Resolver dos veces la misma solicitud | Aprobar o rechazar un participante y repetir la operación. | Evento `error` con `PARTICIPANT_STATE_CONFLICT`; el estado final no se modifica. | **PASS en socket**. Segundo `reject` sobre una solicitud ya resuelta → `PARTICIPANT_STATE_CONFLICT`. |

## Matriz de trazabilidad US ↔ casos

| User story | Casos felices | Casos de error | Cobertura actual |
|---|---|---|---|
| US-01 Creación de sala | QA-01, QA-02 | QA-03, QA-04 | API cubierta (ejecutada con `httpyac`, ver `qa/evidencia-ejecucion-us-01-us-03.md`). FE bloqueado por BUG-03 (no envía JWT). |
| US-02 Ingreso por enlace | QA-05, QA-06 | QA-07, QA-08 | API cubierta (código válido, mayúsculas, código inválido); expiración no implementada (BUG-04). FE bloqueado por BUG-01 (enlace sin página). |
| US-03 Waiting room approve/reject | QA-09, QA-10 | QA-11, QA-12, QA-13, QA-14 | Contrato backend ejecutado y verificado vía Socket.IO (`api_waiting.http`, ver evidencia). FE bloqueado por BUG-02 (falta endpoint de join). |

## Alineación FE/BE

- **Creación:** el backend exige JWT para `POST /api/v1/salas`, pero `createSala()` del frontend no envía `Authorization`. QA-03 debe mantenerse como bloqueo de integración hasta corregir autenticación.
- **Enlace:** el backend devuelve `/sala/{codigo}`, mientras el frontend implementa `/waiting-room?code={codigo}`. QA-05 no puede cerrarse como flujo E2E hasta alinear la URL.
- **Solicitud de ingreso:** el frontend llama `POST /salas/{code}/join`, pero esa ruta no existe en backend. QA-09 no puede ejecutarse desde el flujo FE actual; usar Socket.IO directo para validar el contrato backend.
- **Host:** el backend requiere `host:subscribe` con JWT y rol `HOST`; el frontend no emite actualmente esa suscripción.
- **Demo:** `/waiting-room` puede simular aprobación local, pero no acredita la integración backend ni los estados reject/permission denied.

## Evidencia de ejecución backend

Comando ejecutado (suite automatizada):

```bash
cd apps/server && npm test -- --run
```

Resultado: `3` archivos de test aprobados, `30` tests aprobados, `0` fallos. La salida incluye un log esperado del escenario simulado de error de GetStream (`500`), sin afectar el resultado de la suite. Esta suite verifica QA-01, QA-03, QA-04, QA-06 y QA-07.

Además, se ejecutó manualmente con `httpyac` sobre `api_salas_agenda.http` y `api_waiting.http` (contra `http://localhost:4000`, detalle completo en `qa/evidencia-ejecucion-us-01-us-03.md`), cubriendo QA-02 (sala programada) y QA-09 a QA-14 (waiting room vía Socket.IO). Todos pasaron a nivel API/socket, con las excepciones ya marcadas: **QA-08 FAIL** (no hay regla de expiración, BUG-04) y **QA-05/QA-09/QA-10/QA-11 fallan en el recorrido de usuario del frontend** por BUG-01, BUG-02 y BUG-03 (ver `apps/server/docs/bugs.md`).

## Criterio de cierre QA

El contrato de backend (HTTP + Socket.IO) para US-01 a US-03 está verificado y pasa, salvo QA-08 (expiración de enlace, sin regla de negocio definida — gap de producto, no de implementación). **Ninguna de las tres US puede cerrarse como flujo end-to-end** mientras BUG-01, BUG-02 y BUG-03 sigan bloqueando el recorrido del usuario en el frontend: el enlace no abre el waiting room (BUG-01), el frontend no llama al contrato real de join realtime (BUG-02), y la creación de sala desde la UI no envía JWT (BUG-03). Los casos de API/Socket.IO verificados pueden cerrarse individualmente con la evidencia indicada; el cierre de las historias de usuario depende de que FE resuelva esos tres bugs.
