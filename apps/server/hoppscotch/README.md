# Hoppscotch — MeetFlow API v1.0.1

Colección compartida en el repositorio y versionada por PR. Sustituye a Postman.

Fuente de verdad de schemas: `src/docs/openapi.ts`, servida en `GET /api/v1/docs`.

## Importar

1. Abrir https://hoppscotch.io
2. Collections → Import → Import from File
3. Elegir `meetflow-salas-agenda.json`
4. Variable `baseUrl` = `http://localhost:4000/api/v1`

## Orden

1. `POST /auth/register`
2. `POST /auth/login` (guarda `token` y `refreshToken`)
3. `POST /salas` (guarda `salaId` y `salaCodigo`)
4. El resto usa esas variables

La suite automatizada es `npm run test:http` (`api_auth.http`, `api_salas_agenda.http`, `api_waiting.http`).
