# Reporte final de pruebas — Sprint 4

Fecha: 2026-10-01. Demo previsto: 2026-10-02. Rama: `QA-Sprint4`.

Entorno público: API `https://meetflow-server-tm9i.onrender.com`, web `https://web-ruddy-mu-22.vercel.app`. Evidencia de esta semana: `qa/evidencia-s4-qa1.md`, `qa/evidencia-s4-qa3.md`, `apps/server/docs/bugs.md`. Guion: `qa/checklist-demo-s4.md`.

## Cobertura por historia

En el repo hay casos escritos solo para US-01 a US-07. US-08 a US-12 no tienen matriz: no se les inventó un resultado.

| Historia | Qué se pudo afirmar | Hueco |
|---|---|---|
| US-01 Crear sala | En local y en corridas anteriores, `POST /salas` con JWT responde 201. En Render, el 2026-10-01, responde 500 (BUG-09). | Sin UI en Chrome, Firefox ni mobile en esta semana. |
| US-02 Ingreso por enlace | `GET /salas/:code` ya estaba en verde. El 2026-10-01, `/sala/QA-S4` en Vercel redirige a `/waiting-room` (BUG-01 cerrado). | El ingreso completo no se recorrió en el entorno público porque no se puede crear la sala. |
| US-03 Waiting room | En S2 el approve/reject funcionó en la UI local. El call id real y el reenvío de pendientes quedaron retesteados por tests el 2026-10-01 (BUG-05, BUG-06). | No se repitió con dos navegadores contra Render. |
| US-04 Audio/video | El código une a los dos al call de GetStream de la sala. | Nunca se vio con dos personas en este sprint. |
| US-05 Chat | Hay panel de chat en la reunión. | Sin ejecución. |
| US-06 Pantalla compartida | El control viene del SDK de GetStream. | Sin ejecución. |
| US-07 Controles de la llamada | Hay toggles de cámara y micrófono. | Sin ejecución de a dos. |
| US-08 a US-12 | Sin casos en el repo. | Sin ejecución. |

Chrome, Firefox y mobile no se recorrieron en S4. La suite de API contra Render no está verde: `api_auth.http` 14/14; salas, invitaciones y waiting room se cortan al crear la sala. Hoppscotch no se corrió como cliente aparte.

## Bugs por severidad

| Bug | Severidad | Estado al 2026-10-01 |
|---|---|---|
| BUG-09 `POST /salas` → 500 en Render | crítica | Abierto. Bloquea el demo público. |
| BUG-10 rutas de invitaciones ausentes en Render | alta | Abierto. El código está en `develop`; el proceso desplegado no. |
| BUG-05 call id distinto al del host | alta | Corregido en código. Falta verlo en una llamada real. |
| BUG-02 join HTTP inexistente | alta | Corregido (PR #82). |
| BUG-03 crear sala sin JWT | alta | Corregido (PR #82). |
| BUG-01 enlace `/sala/:codigo` | media | Corregido. Retesteado en Vercel. |
| BUG-04 enlace sin vencimiento | media | Won't fix. `fechaInicio` no es una expiración. |
| BUG-06 pendientes perdidos al recargar | media | Corregido. Retesteado por test. |
| BUG-07 id no-UUID → 500 | media | Corregido en código (ahora 400). En Render sigue el 500 hasta el deploy. |
| BUG-08 `join:request` sin validar | baja | Corregido. |

Abiertos que importan para el demo: **2** (BUG-09, BUG-10). Los dos los tiene que resolver quien despliega Render, no otro cambio de producto.

## Lecciones

- Un 500 genérico en producción no alcanza para diagnosticar. El handler esconde el mensaje de GetStream, y el cuerpo que devolvió Render ni siquiera coincide con el `StreamServiceError` del código actual. La próxima vez, el error de integración tiene que salir con un código propio en el log del servidor.
- El código de `develop` y el proceso de Render no son el mismo sistema. La regresión de S4-QA1 se frenó entera por un deploy atrasado, no por un fallo nuevo de UI.
- Afirmar en la suite el comportamiento roto (el 500 del id mal formado) deja la suite en verde mientras el bug sigue vivo. Al corregirlo hay que cambiar la aserción en el mismo cambio.
- No toda falla de la matriz es un bug. BUG-04 era un hueco de producto: la fecha de inicio no vence el enlace. Dejarlo como won't fix evitó un fix inventado el día del freeze.
- La evidencia se escribe solo de corridas reales. En S4 no hay capturas de Chrome, Firefox ni mobile, y el reporte no las simula.

## Listo para el 02/10

- Guion paso a paso: `qa/checklist-demo-s4.md`.
- Este reporte, más `apps/server/docs/bugs.md`.
- El demo público queda condicionado a que `POST /salas` responda 201 en Render. Si no, se presenta el mismo guion en local y se dice que BUG-09 y BUG-10 siguen abiertos en el entorno deployado.
