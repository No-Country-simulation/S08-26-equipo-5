# Casos manuales QA: US-01 a US-03

## Alcance

Casos para creación de sala, ingreso mediante enlace/código y waiting room con aprobación o rechazo. La ejecución backend se respalda con la suite de Vitest del servidor; los casos Socket.IO requieren ejecución manual con dos clientes conectados.

## Datos y precondiciones

- Backend disponible desde `apps/server`.
- Base de datos y variables de entorno configuradas.
- Usuario host registrado, con JWT vigente y rol `HOST` en la sala.
- Usuario participante de prueba: `Ana Perez`, `ana@example.com`.
- Para casos de enlace, conservar el `codigo` devuelto por `POST /api/v1/salas`.
- Para casos realtime, conectar participante y host al namespace `/reuniones`.

## Convenciones de resultado

- **PASS**: comportamiento verificado por la suite backend.
- **MANUAL PENDIENTE**: requiere interacción de dos clientes o validación visual FE.
- **BLOCKED**: el contrato necesario no existe o no puede probarse con la implementación actual.
- **NOT IMPLEMENTED**: la matriz exige el estado, pero no hay regla backend que lo produzca.

## Casos de prueba

| ID | Historia | Caso | Pasos principales | Resultado esperado | Resultado / evidencia |
|---|---|---|---|---|---|
| QA-01 | US-01 | Crear sala activa | Con JWT válido, enviar `POST /api/v1/salas` con `{"nombre":"Sala QA"}`. | `201`; devuelve `salaId`, `codigo`, `nombre`, `enlace` y `streamRoomId`. El host queda aprobado. | **PASS**. `salas.test.ts`: creación con JWT. |
| QA-02 | US-01 | Crear sala programada | Con JWT válido, enviar `POST /api/v1/salas` con `nombre` y `fechaInicio` futura. | `201`; sala con estado `PROGRAMADA`, código único y enlace utilizable. | **MANUAL PENDIENTE**. El contrato está implementado, pero no hay aserción automatizada específica de `fechaInicio`. |
| QA-03 | US-01 | Permiso denegado al crear | Repetir QA-01 sin `Authorization` y con JWT inválido. | `401`, código `UNAUTHORIZED`; no se crea sala ni sala Stream. | **PASS**. Suite backend cubre ambos casos. |
| QA-04 | US-01 | Datos inválidos al crear | Enviar `nombre` vacío y luego un nombre de 151 caracteres, con JWT válido. | `400`; mensaje refiere a `nombre` y a límite `150`; no se llama a GetStream. | **PASS**. Suite backend cubre ambos casos. |
| QA-05 | US-02 | Ingresar con enlace/código válido | Usar el `codigo` de QA-01 y enviar `GET /api/v1/salas/{codigo}`. Continuar a waiting room con ese código. | `200`; devuelve datos públicos de la sala y permite cargar waiting room. | **PASS** para API. **BLOCKED** para el flujo FE completo: el enlace generado es `/sala/{codigo}`, pero la ruta FE disponible usa `/waiting-room?code={codigo}`. |
| QA-06 | US-02 | Código en minúsculas | Enviar `GET /api/v1/salas/{codigo-en-minusculas}`. | `200`; el backend normaliza el código a mayúsculas y devuelve la sala. | **PASS**. Suite backend cubre normalización. |
| QA-07 | US-02 | Enlace/código inválido | Enviar `GET /api/v1/salas/NOEXISTE`. | `404`; mensaje `Sala no encontrada`; no se muestra una sala inexistente. | **PASS**. Suite backend cubre el caso. |
| QA-08 | US-02 | Enlace expirado | Usar un enlace cuya fecha de vigencia haya terminado. | La matriz requiere rechazo controlado, idealmente `410` o error equivalente, sin acceso a la sala. | **NOT IMPLEMENTED**. El backend no aplica expiración de enlaces ni define un estado `EXPIRED`; registrar como gap de producto antes de cerrar este caso. |
| QA-09 | US-03 | Solicitar ingreso y quedar pendiente | Conectar participante al namespace `/reuniones`; emitir `join:request` con `salaCodigo`, nombre, apellido y email. Host conectado y suscripto. | Se crea participante `PENDIENTE`; host recibe `join:pending`; participante permanece esperando. | **MANUAL PENDIENTE**. Requiere cliente Socket.IO y base de datos activa. |
| QA-10 | US-03 | Host aprueba solicitud | Desde el host, emitir `participant:approve` con `participanteId` pendiente. | Participante recibe `join:approved`, `streamCallId` no nulo y puede ingresar a la sala; se emite `room:state`. | **MANUAL PENDIENTE**. Validar también que solo el host pueda emitir la acción. |
| QA-11 | US-03 | Host rechaza solicitud | Crear una solicitud pendiente y emitir `participant:reject` desde el host. | Participante recibe `join:rejected`; `streamCallId` es `null`; no ingresa a la sala y puede solicitar nuevamente según FE. | **MANUAL PENDIENTE**. El backend define el evento; falta prueba realtime automatizada. |
| QA-12 | US-03 | Permiso denegado en waiting room | Intentar `host:subscribe`, `participant:approve` y `participant:reject` sin JWT y con JWT de usuario no host. | Evento `error` con `UNAUTHORIZED` para token ausente/inválido y `HOST_ONLY` para usuario sin rol host. No cambia el estado del participante. | **MANUAL PENDIENTE**. Contrato definido en backend; requiere verificar emisión de eventos. |
| QA-13 | US-03 | Solicitud sobre sala inexistente | Emitir `join:request` con un `salaCodigo` inexistente. | Evento `error` con `ROOM_NOT_FOUND` y mensaje `No existe una sala con ese código`. | **MANUAL PENDIENTE**. Validar con namespace realtime. |
| QA-14 | US-03 | Resolver dos veces la misma solicitud | Aprobar o rechazar un participante y repetir la operación. | Evento `error` con `PARTICIPANT_STATE_CONFLICT`; el estado final no se modifica. | **MANUAL PENDIENTE**. Validar con namespace realtime. |

## Matriz de trazabilidad US ↔ casos

| User story | Casos felices | Casos de error | Cobertura actual |
|---|---|---|---|
| US-01 Creación de sala | QA-01, QA-02 | QA-03, QA-04 | API cubierta; QA-02 requiere ejecución manual específica de sala programada. |
| US-02 Ingreso por enlace | QA-05, QA-06 | QA-07, QA-08 | Código válido, mayúsculas y código inválido cubiertos; expiración no implementada. |
| US-03 Waiting room approve/reject | QA-09, QA-10 | QA-11, QA-12, QA-13, QA-14 | Contrato backend definido; falta ejecución realtime automatizada/manual con dos clientes. |

## Alineación FE/BE

- **Creación:** el backend exige JWT para `POST /api/v1/salas`, pero `createSala()` del frontend no envía `Authorization`. QA-03 debe mantenerse como bloqueo de integración hasta corregir autenticación.
- **Enlace:** el backend devuelve `/sala/{codigo}`, mientras el frontend implementa `/waiting-room?code={codigo}`. QA-05 no puede cerrarse como flujo E2E hasta alinear la URL.
- **Solicitud de ingreso:** el frontend llama `POST /salas/{code}/join`, pero esa ruta no existe en backend. QA-09 no puede ejecutarse desde el flujo FE actual; usar Socket.IO directo para validar el contrato backend.
- **Host:** el backend requiere `host:subscribe` con JWT y rol `HOST`; el frontend no emite actualmente esa suscripción.
- **Demo:** `/waiting-room` puede simular aprobación local, pero no acredita la integración backend ni los estados reject/permission denied.

## Evidencia de ejecución backend

Comando ejecutado:

```bash
cd apps/server && npm test -- --run
```

Resultado: `3` archivos de test aprobados, `30` tests aprobados, `0` fallos. La salida incluye un log esperado del escenario simulado de error de GetStream (`500`), sin afectar el resultado de la suite.

La suite existente verifica QA-01, QA-03, QA-04, QA-06 y QA-07. Los casos QA-02 y QA-09 a QA-14 requieren ampliar pruebas o ejecutar clientes realtime. QA-08 queda pendiente de definición e implementación de expiración.

## Criterio de cierre QA

US-01 a US-03 no deben marcarse completamente cerradas mientras QA-05 siga desalineado, QA-08 no tenga regla de negocio y QA-09 a QA-14 no cuenten con evidencia realtime. Los casos de API actualmente verificados pueden cerrarse individualmente con la evidencia indicada.
