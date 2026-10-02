# Evidencia de ejecución — S4-QA3

Tarea: cerrar los bugs de `apps/server/docs/bugs.md`, retestear los fixes y dejar decisión en los que no se corrigen.

Fecha: 2026-10-01. Rama: `QA-Sprint4`.

No hay tarjetas de GitHub enlazadas desde `docs/bugs.md`. La tarjeta de cada bug es su sección en ese archivo. Esta nota es la evidencia del retest.

## Decisiones

| Bug | Severidad | Decisión | Retest |
|---|---|---|---|
| BUG-01 | media | Corregido | `GET https://web-ruddy-mu-22.vercel.app/sala/QA-S4` → 307 `location: /waiting-room?code=QA-S4`, y el destino responde 200. |
| BUG-02 | alta | Ya estaba corregido (PR #82) | Sin retest nuevo. |
| BUG-03 | alta | Ya estaba corregido (PR #82) | Sin retest nuevo. |
| BUG-04 | media | **Won't fix** | `fechaInicio` es el inicio programado, no un vencimiento. No se agrega `EXPIRED`. |
| BUG-05 | alta | Corregido en código | `waiting-room.test.ts`: "emite el callId REAL, no uno derivado del código de sala". Videollamada de dos personas en Render no se repitió (BUG-09). |
| BUG-06 | media | Corregido | `waitingRoom.handlers.test.ts`: "reenvía join:pending de los PENDIENTE de la sala solo a este socket". |
| BUG-07 | media | Corregido | `uuid.test.ts`: id no-UUID → 400 `VALIDATION_ERROR`. El caso 29 de `api_salas_agenda.http` ahora espera 400. En Render sigue el 500 hasta el próximo deploy. |
| BUG-08 | baja | Ya estaba corregido | Sin retest nuevo. |
| BUG-09 | crítica | Sigue **abierto** | No es un cambio de código que se pueda cerrar acá. El health de Render está en 200 y `POST /salas` sigue en 500 (S4-QA1). |
| BUG-10 | alta | Sigue **abierto** | Las rutas existen en `develop`. El proceso de Render responde 404 genérico. Falta el deploy. |

## Tests corridos

`apps/server`: vitest 3.2.7, 3 archivos, 43 tests, todos verdes.

- `src/__tests__/uuid.test.ts`
- `src/__tests__/waitingRoom.handlers.test.ts`
- `src/__tests__/waiting-room.test.ts`

## Qué no cierra la tarea

BUG-09 (crítico) y BUG-10 (alto) siguen abiertos. Los dos dependen de que Render pase a servir este `develop`. Hasta entonces la regresión manual de S4-QA1 no puede continuar.
