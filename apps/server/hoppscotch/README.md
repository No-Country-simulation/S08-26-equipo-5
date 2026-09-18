# Hoppscotch — Importar Endpoints MeetFlow

## Opción 1: Importar colección JSON (recomendado)

1. Abrir Hoppscotch: https://hoppscotch.io
2. Ir a **Collections** (panel izquierdo)
3. Click en **Import** → **Import from File**
4. Seleccionar: `meetflow-salas-agenda.json`
5. La colección aparecerá con todos los endpoints

## Opción 2: Importar OpenAPI (documentación interactiva)

1. Abrir Hoppscotch
2. Ir a **Collections** → **Import** → **Import from OpenAPI**
3. Seleccionar: `openapi.yaml`
4. Se creará la colección con schemas documentados

## Variables automáticas

Al importar, estas variables se crean automáticamente:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `baseUrl` | `http://localhost:4000/api/v1` | Base de la API |
| `token` | `""` | Se llena al hacer login |
| `salaId` | `""` | Se llena al crear sala |
| `salaCodigo` | `""` | Se llena al crear sala |

## Flujo de prueba rápido

1. **Ejecutar** `POST /auth/login` → Guarda token automáticamente
2. **Ejecutar** `POST /salas` → Guarda salaId y salaCodigo
3. **Ejecutar** cualquier otro endpoint → Usa las variables

## Scripts automáticos

Cada request tiene un `testScript` que:
- Imprime resultados en la consola
- Guarda variables para siguientes requests
- Muestra mensajes de éxito/error

## Estructura de la colección

```
MeetFlow API — Salas & Agenda
├── Auth
│   ├── POST /auth/register
│   └── POST /auth/login
├── Salas
│   ├── POST /salas
│   ├── GET /salas/:code (público)
│   ├── GET /salas/:id/detalle
│   ├── PUT /salas/:id
│   ├── DELETE /salas/:id
│   └── GET /salas/:id/participantes
├── Agenda
│   ├── GET /salas/mis-salas/list
│   └── GET /salas/programadas/list
└── Legacy
    └── POST /rooms/:id/token
```

## Archivos

- `meetflow-salas-agenda.json` — Colección Hoppscotch
- `openapi.yaml` — Documentación OpenAPI 3.0
