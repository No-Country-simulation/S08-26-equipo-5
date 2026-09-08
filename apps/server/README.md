# MeetFlow - Backend Server

API REST para el MVP de MeetFlow. Node.js + Express + Prisma + PostgreSQL (Neon).

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| ORM | Prisma 6 |
| Base de datos | PostgreSQL (Neon) |
| Lenguaje | TypeScript 5 |

## Modelo de datos

### Diagrama ER

```mermaid
erDiagram
    USUARIO {
        uuid id PK
        string nombre
        string apellido
        string email UK
        string passwordHash
        datetime createdAt
        datetime updatedAt
    }
    SALA {
        uuid id PK
        string codigo UK
        string nombre
        string resumen
        datetime fechaInicio
        datetime fechaFin
        enum estado
        datetime createdAt
        datetime updatedAt
    }
    PARTICIPANTE {
        uuid id PK
        uuid usuarioId FK
        uuid salaId FK
        string nombre
        string apellido
        string email
        enum rol
        enum estado
        datetime fechaIngreso
        datetime fechaSalida
        datetime createdAt
        datetime updatedAt
    }

    USUARIO ||--o{ PARTICIPANTE : "tiene"
    SALA ||--o{ PARTICIPANTE : "contiene"
```

### Diagrama de relaciones

```
+--------------+       +------------------+       +--------------+
|   USUARIO    |       |   PARTICIPANTE   |       |     SALA     |
+--------------+       +------------------+       +--------------+
| id (UUID)    |---+   | id (UUID)        |   +---| id (UUID)    |
| nombre       |   +-->| usuarioId (UUID) |   |   | codigo       |
| apellido     |       | salaId (UUID)    |<--+   | nombre       |
| email (UK)   |       | nombre           |       | resumen      |
| passwordHash |       | apellido         |       | fechaInicio  |
| createdAt    |       | email            |       | fechaFin     |
| updatedAt    |       | rol              |       | estado       |
+--------------+       | estado           |       | createdAt    |
                       | fechaIngreso     |       | updatedAt    |
                       | fechaSalida      |       +--------------+
                       | createdAt        |
                       | updatedAt        |
                       +------------------+

Relaciones:
  USUARIO  1 ---- * PARTICIPANTE  (usuarioId -> Usuario.id)
  SALA     1 ---- * PARTICIPANTE  (salaId -> Sala.id)
  Constraint: UNIQUE (salaId, usuarioId)
```

### Enums

| Enum | Valores |
|------|---------|
| RolParticipante | HOST, PARTICIPANTE |
| EstadoParticipante | PENDIENTE, APROBADO, RECHAZADO |
| EstadoSala | PROGRAMADA, ACTIVA, FINALIZADA, CANCELADA |

### Indices

| Tabla | Indice | Tipo |
|-------|--------|------|
| Sala | codigo | UNIQUE |
| Sala | fechaInicio | INDEX |
| Sala | estado | INDEX |
| Participante | (salaId, usuarioId) | UNIQUE |
| Participante | usuarioId | INDEX |
| Participante | salaId | INDEX |

## Onboarding

### Requisitos

- Node.js 20+
- npm
- Conexion a Neon (string en .env)

### Pasos

```bash
# 1. Clonar el repo
git clone <repo-url>
cd S08-26-equipo-5

# 2. Checkout de la rama con la BD
git checkout feature/db-prisma-models

# 3. Ir al backend
cd apps/server

# 4. Copiar .env.example y completar con el DATABASE_URL
cp .env.example .env
# Editar .env con el connection string de Neon

# 5. Instalar dependencias
npm install

# 6. Generar el Prisma Client
npx prisma generate

# 7. Verificar que la migracion esta aplicada
npx prisma migrate status

# 8. Ver datos en el navegador
npx prisma studio
```

## Comandos

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Iniciar servidor en modo desarrollo (watch) |
| `npm run build` | Compilar TypeScript |
| `npm run start` | Ejecutar build compilado |
| `npx prisma studio` | Abrir UI de Prisma para ver datos |
| `npx prisma migrate dev` | Aplicar cambios del schema como migracion |
| `npx prisma migrate deploy` | Aplicar migraciones pendientes (produccion) |
| `npx prisma db seed` | Ejecutar seeds de desarrollo |
| `npx prisma generate` | Regenerar Prisma Client |
| `npx prisma validate` | Validar el schema |

## Seeds

Los seeds crean datos de prueba al ejecutar `npm run prisma:seed`:

| Entidad | Cantidad | Detalle |
|---------|----------|---------|
| Usuarios | 5 | juan.perez, maria.garcia, carlos.lopez, ana.martinez, pedro.rodriguez |
| Salas | 3 | PROGRAMADA, ACTIVA, FINALIZADA |
| Participantes | 8 | Combinaciones de roles y estados |

Password de prueba: todos usan el mismo hash hardcodeado para desarrollo.

## Estructura de archivos

```
apps/server/
├── prisma/
│   ├── migrations/
│   │   └── 20260908151139_init/
│   │       └── migration.sql
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   └── index.ts
├── .env.example
├── .env (no commiteado)
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Variables de entorno

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| DATABASE_URL | Connection string de PostgreSQL | `postgresql://user:pass@host/db?sslmode=require` |

## Convenciones

- Branches: `feature/<nombre>` desde `develop`
- Commits: Conventional Commits 1.0.0
- Schema: Prisma con UUIDs, timestamps automaticos
- Secrets: Nunca commitear `.env`
