# Casos manuales QA: US-04 a US-07 (reunión en vivo)

## Alcance

Casos para la reunión en vivo una vez que el participante ya fue aprobado en el waiting room: audio/video entre host y participantes (US-04), chat de texto (US-05), pantalla compartida (US-06) y controles/toggles durante la llamada (US-07).

**Este documento es de diseño, no de ejecución.** Se redacta antes de que exista build de S3 para que `S3-QA1` pueda arrancar a ejecutar en cuanto el frontend tenga la funcionalidad. Se incluye el estado actual de implementación de cada historia (a partir de una revisión del código de `develop` al 2026-09-25) para que el equipo sepa qué falta construir antes de poder cerrar cada caso.

## Estado actual de implementación (referencia para FE/BE, no reemplaza la revisión de S3-QA1)

| Historia | Estado en `develop` |
|---|---|
| US-04 Audio/video | Parcial. `apps/web/app/components/stream-conference.tsx` conecta a GetStream (`@stream-io/video-react-sdk`) y renderiza `SpeakerLayout` + `CallControls` (mic/cámara/salir incluidos por el SDK). **Bloqueado end-to-end por BUG-05** (`apps/server/docs/bugs.md`): el participante aprobado recibe un `streamCallId` distinto al del host, así que hoy nunca comparten la misma llamada real. |
| US-05 Chat | No implementado. No hay ningún paquete de chat (`stream-chat`, etc.) ni componente de chat en `apps/web`. Los casos de esta sección son 100% prospectivos. |
| US-06 Pantalla compartida | No hay código propio, pero `CallControls` de GetStream trae un botón de compartir pantalla por defecto del SDK. No fue probado nunca (bloqueado por el mismo problema de BUG-05: sin dos participantes en la misma call real, no se puede validar quién ve la pantalla compartida de quién). |
| US-07 Toggles / controles de la llamada | Parcial. Existen toggles de cámara/mic tanto en el modo "vista previa local" (`toggle-camera-btn`, `toggle-mic-btn` en `room/page.tsx`) como los que trae `CallControls` de GetStream una vez conectado. No hay controles de host sobre otros participantes (mutear a otro, expulsar, finalizar la reunión para todos) en ningún lugar del código. |

## Datos y precondiciones

- Dos usuarios de prueba: host (`HOST`, JWT vigente) y participante aprobado (`PARTICIPANTE`, ya pasó por waiting room y quedó `APROBADO`).
- Sala con `streamRoomId` real de GetStream (asignado en `POST /salas`).
- **Antes de poder ejecutar estos casos de punta a punta se necesita que BUG-05 esté resuelto** (participante y host deben terminar en el mismo `callCid` de GetStream). Sin eso, todos los casos de esta sección que requieren dos participantes reales quedan bloqueados igual que QA-09/10/11 lo estuvieron por BUG-02/03 en S1-QA2.
- Cámaras/micrófonos de prueba disponibles en ambos dispositivos/navegadores usados para la ejecución.
- Para los casos de chat y pantalla compartida: la funcionalidad debe existir en el build de S3 antes de poder marcar el caso como ejecutado (hoy no existe, ver tabla de arriba).

## Convenciones de resultado (para cuando S3-QA1 ejecute)

- **PASS**: comportamiento verificado en un build real de S3.
- **FAIL**: el comportamiento esperado no se cumple.
- **BLOCKED**: no se puede ejecutar porque una dependencia (BUG-05, falta de feature) lo impide.
- **NOT IMPLEMENTED**: la funcionalidad todavía no existe en el código, no aplica ejecutar el caso.

Al momento de este diseño (2026-09-25) ningún caso tiene resultado propio: quedan listos para que S3-QA1 los complete apenas haya build. La columna "Resultado esperado al día de hoy" solo indica qué pasaría si se intentara ejecutar contra `develop` tal como está.

## Casos de prueba

### US-04 — Audio y video entre host y participantes

| ID | Caso | Pasos principales | Resultado esperado | Resultado esperado al día de hoy |
|---|---|---|---|---|
| QA-15 | Host y participante se ven y escuchan | Host crea sala y entra a `/room`. Participante pasa por waiting room, queda aprobado y entra a la reunión. Ambos habilitan cámara/mic. | Cada lado ve el video y escucha el audio del otro en `SpeakerLayout`. | **BLOCKED** por BUG-05: cada uno queda en una call de GetStream distinta, nunca se ven. |
| QA-16 | Reconexión tras pérdida de red | Con la llamada activa, cortar la conexión de red del participante por ~10s y restaurarla. | El participante se reconecta a la misma call sin que el host tenga que volver a aprobarlo; el video/audio se recupera. | No implementado ningún manejo explícito de reconexión más allá de lo que el SDK de GetStream haga por defecto; no probado. |
| QA-17 | Un tercer participante se suma a una llamada en curso | Con host + 1 participante ya conectados, aprobar a un segundo participante. | El tercero se conecta a la misma call y los tres se ven/escuchan entre sí. | **BLOCKED** por BUG-05 (ni siquiera el segundo se conecta a la call correcta). |
| QA-18 | Host sin cámara/mic (solo audio o ninguno) | Host deniega permisos de cámara/mic del navegador antes de entrar a `/room`. | La UI muestra un estado claro de error (`mediaError`/`connectionError`) sin romper la pantalla; el resto de la reunión sigue usable. | Parcial: `stream-conference.tsx` y `room/page.tsx` ya manejan el catch de `getUserMedia` con mensajes de error, pero no se validó en un escenario real con GetStream conectado. |

### US-05 — Chat de texto durante la reunión

| ID | Caso | Pasos principales | Resultado esperado | Resultado esperado al día de hoy |
|---|---|---|---|---|
| QA-19 | Enviar y recibir mensajes en tiempo real | Con host y participante en la misma reunión, el host escribe un mensaje en el chat. | El participante lo recibe en tiempo real, con nombre del emisor y hora. | **NOT IMPLEMENTED**: no existe UI de chat ni canal backend para esto. |
| QA-20 | Historial de chat al entrar tarde | Un participante se une después de que ya hubo mensajes en el chat. | El participante ve el historial de mensajes previos de esa sesión (o al menos desde que se conectó, según se defina el alcance del producto). | **NOT IMPLEMENTED**. Definir con PM si el chat debe persistir historial o ser efímero por sesión. |
| QA-21 | Mensaje vacío o solo espacios | Intentar enviar un mensaje vacío o con solo espacios. | El input no permite enviar, o el mensaje se descarta sin generar un evento vacío en el chat. | **NOT IMPLEMENTED**. |
| QA-22 | Chat después de que el participante es expulsado o se desconecta | Expulsar a un participante (US-07) o desconectarlo, y verificar el chat. | El participante desconectado deja de recibir mensajes nuevos; el resto de la sala sigue viendo el chat con normalidad. | **NOT IMPLEMENTED**; depende también de que exista la funcionalidad de expulsión (US-07, QA-26). |

### US-06 — Pantalla compartida

| ID | Caso | Pasos principales | Resultado esperado | Resultado esperado al día de hoy |
|---|---|---|---|---|
| QA-23 | Un participante comparte su pantalla | Con dos participantes conectados a la misma call, uno activa "compartir pantalla" desde `CallControls`. | El resto de los participantes ve la pantalla compartida en el layout principal, en vez del video de cámara de esa persona. | **BLOCKED** por BUG-05 para probarlo con 2 partes reales; el botón de `CallControls` viene del SDK de GetStream, no hay código propio que lo deshabilite, pero nunca se ejecutó con dos partes en la misma call. |
| QA-24 | Dejar de compartir pantalla | Con pantalla compartida activa, el mismo participante la detiene. | El layout vuelve a mostrar el video de cámara normal para todos. | **BLOCKED**, mismo motivo que QA-23. |
| QA-25 | Dos participantes intentan compartir pantalla a la vez | Participante A comparte pantalla; mientras sigue activo, participante B también intenta compartir. | Definir comportamiento esperado con PM/BE: ¿se permite compartir en simultáneo (layout con ambas) o se bloquea la segunda hasta que la primera termine? | **NOT DEFINIDO**: no hay una decisión de producto registrada sobre este caso; agregar a la reunión de alineación FE/BE antes de que S3-QA1 lo ejecute. |

### US-07 — Controles y toggles durante la llamada

| ID | Caso | Pasos principales | Resultado esperado | Resultado esperado al día de hoy |
|---|---|---|---|---|
| QA-26 | Host mutea a un participante | Desde un panel de control del host, mutear el micrófono de otro participante. | El micrófono de ese participante se apaga del lado de todos (no solo localmente); el participante ve un indicador de que fue muteado por el host. | **NOT IMPLEMENTED**: no existe ningún control de host sobre micrófonos ajenos en el código actual, solo el propio (`toggle-mic-btn` es local a cada usuario). |
| QA-27 | Host expulsa a un participante | Desde el panel de host, expulsar a un participante de la llamada en curso. | El participante es desconectado de la call de GetStream y redirigido (por ejemplo, a `/home` con un mensaje); no puede volver a entrar sin pasar de nuevo por el waiting room. | **NOT IMPLEMENTED**. |
| QA-28 | Participante apaga/enciende su propia cámara y micrófono | Con la llamada activa, cada participante usa los toggles de `CallControls` (o los locales de `room/page.tsx` en modo preview) para apagar/encender cámara y mic. | El cambio se refleja para el resto de los participantes en tiempo real (el video se congela/oculta, el audio deja de transmitirse). | Parcial: los toggles existen a nivel de UI local (`cameraEnabled`/`microphoneEnabled` en `room/page.tsx`, y los de `CallControls` de GetStream), pero no se validó el efecto visible para el resto por el mismo bloqueo de BUG-05. |
| QA-29 | Host finaliza la reunión para todos | El host usa una acción de "Finalizar reunión" (a construir). | Todos los participantes son desconectados de la call y redirigidos; la sala pasa a un estado `FINALIZADA` (o equivalente) en el backend. | **NOT IMPLEMENTED**: no existe esta acción en frontend ni backend. Verificar si `EstadoSala` del schema ya contempla un estado de cierre reutilizable. |
| QA-30 | Permisos: un participante intenta usar un control de host | Un usuario con rol `PARTICIPANTE` intenta mutear/expulsar a otro (por ejemplo, llamando directo al endpoint/evento si se llega a implementar por Socket.IO). | La acción es rechazada con un error de permisos (`HOST_ONLY` o equivalente), igual que ya pasa hoy con `host:subscribe`/`participant:approve/reject` en el waiting room. | **NOT IMPLEMENTED**, pero el patrón de `HOST_ONLY` ya existe en `waitingRoom.handlers.ts` y debería reutilizarse como referencia de diseño para BE. |

## Matriz de trazabilidad US ↔ casos

| User story | Casos felices | Casos de error / permisos | Cobertura de diseño |
|---|---|---|---|
| US-04 Audio/video en la reunión | QA-15, QA-17 | QA-16, QA-18 | Diseño completo. Ejecución bloqueada por BUG-05 hasta que se corrija el `streamCallId`. |
| US-05 Chat de texto | QA-19, QA-20 | QA-21, QA-22 | Diseño completo. Funcionalidad no implementada; requiere build de S3 antes de poder ejecutar cualquier caso. |
| US-06 Pantalla compartida | QA-23 | QA-24, QA-25 | Diseño completo. QA-25 requiere definición de producto antes de poder redactarse como caso cerrado (comportamiento con doble compartido no está decidido). |
| US-07 Controles/toggles de la llamada | QA-28 | QA-26, QA-27, QA-29, QA-30 | Diseño completo. Los controles de host (mutear/expulsar/finalizar) no existen todavía; los toggles propios (cámara/mic) sí tienen base de UI pero no fueron validados en una call real de dos partes. |

## Dependencias y bloqueos para S3-QA1

1. **BUG-05** (`apps/server/docs/bugs.md`) debe resolverse antes de poder ejecutar cualquier caso que requiera dos partes reales en la misma videollamada (QA-15, QA-17, QA-23, QA-24, QA-28). Es el bloqueo más urgente porque afecta a las cuatro historias.
2. **Chat (US-05)** y **controles de host (QA-26, QA-27, QA-29 de US-07)** no tienen ningún código todavía — son features a construir en S3, no bugs a corregir. S3-QA1 no puede arrancar esos casos hasta que exista el build correspondiente.
3. **QA-25** (doble pantalla compartida simultánea) necesita una decisión de producto antes de poder ejecutarse o incluso de terminar de redactarse como caso cerrado — llevarlo a la reunión de alineación FE/BE mencionada en el criterio de aceptación de esta tarea.

## Revisión FE/BE

Pendiente de agendar la reunión de alineación con FE/BE mencionada en el criterio de aceptación de S2-QA3. Puntos a confirmar en esa reunión:

- Alcance real de "chat" para S3: ¿persiste historial entre sesiones o es efímero? ¿Solo texto o también reacciones/emojis?
- Si "pantalla compartida" permite más de un presentador a la vez (QA-25).
- Qué controles de host se van a construir en S3 (mutear individual, expulsar, finalizar para todos) y si usan el mismo namespace `/reuniones` de Socket.IO que ya existe para el waiting room, o uno nuevo.
- Confirmar que la corrección de BUG-05 está priorizada antes o junto con el arranque de S3, ya que bloquea la ejecución de la mitad de estos casos.
