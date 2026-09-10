# MeetFlow - Backend Server

API REST para el MVP de MeetFlow. Node.js + Express + Prisma + PostgreSQL (Neon).

## Navegación

- [Stack](#stack)
- [Arquitectura MVC](#arquitectura-mvc)
- [Estructura de archivos](#estructura-de-archivos)
- [Modelo de datos](#modelo-de-datos)
- [Onboarding](#onboarding)
- [Comandos](#comandos)
- [Variables de entorno](#variables-de-entorno)
- [Convenciones](#convenciones)

---

## Stack

| Componente    | Tecnología        |
| ------------- | ----------------- |
| Runtime       | Node.js 20+       |
| Framework     | Express 5         |
| ORM           | Prisma 6          |
| Base de datos | PostgreSQL (Neon) |
| Lenguaje      | TypeScript 5      |

---

## Arquitectura MVC

El backend sigue el patrón **Model-View-Controller** para separar responsabilidades:

| Capa           | Responsabilidad                                    | Ubicación          |
| -------------- | -------------------------------------------------- | ------------------ |
| **Config**     | Variables de entorno y configuración centralizada  | `src/config/`      |
| **Models**     | Acceso a datos via Prisma Client                   | `src/models/`      |
| **Services**   | Lógica de negocio, validaciones, transformaciones  | `src/services/`    |
| **Controllers**| Reciben HTTP, validan input, delegan a services    | `src/controllers/` |
| **Routes**     | Definen endpoints y métodos HTTP                   | `src/routes/`      |
| **Middlewares**| Cross-cutting: auth, logging, error handling       | `src/middlewares/` |

**Flujo de una request:**

```
HTTP Request → Router → Middleware(s) → Controller → Service → Model (Prisma) → DB
                                                                      ↓
HTTP Response ← Controller ← Service ← Model ←───────────────────────┘
```

---

## Estructura de archivos

```text
apps/server/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── app.ts          ← Configuración de Express (middlewares, rutas, handlers)
│   └── server.ts       ← Entry point (listen)
│
├── prisma/
│   ├── migrations/
│   │   └── 20260908151139_init/
│   │       └── migration.sql
│   ├── schema.prisma
│   └── seed.ts
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Modelo de datos

### Diagrama ER

```mermaid
erDiagram
    USUARIO ||--o{ PARTICIPANTE : participa
    SALA ||--o{ PARTICIPANTE : contiene

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
```

### Relaciones

* `Usuario` 1:N `Participante`
* `Sala` 1:N `Participante`
* `UNIQUE(salaId, usuarioId)` evita que un usuario tenga registros duplicados dentro de una misma sala.
* `usuarioId` permite conservar la relación con el usuario, mientras que `nombre`, `apellido` y `email` funcionan como snapshot de sus datos para mantener el historial.

### Enums

| Enum                 | Valores                                           |
| -------------------- | ------------------------------------------------- |
| `RolParticipante`    | `HOST`, `PARTICIPANTE`                            |
| `EstadoParticipante` | `PENDIENTE`, `APROBADO`, `RECHAZADO`              |
| `EstadoSala`         | `PROGRAMADA`, `ACTIVA`, `FINALIZADA`, `CANCELADA` |

### Índices y restricciones

| Tabla          | Índice / Restricción  | Tipo   |
| -------------- | --------------------- | ------ |
| `Sala`         | `codigo`              | UNIQUE |
| `Sala`         | `fechaInicio`         | INDEX  |
| `Sala`         | `estado`              | INDEX  |
| `Participante` | `(salaId, usuarioId)` | UNIQUE |
| `Participante` | `usuarioId`           | INDEX  |
| `Participante` | `salaId`              | INDEX  |

---

## Onboarding

### Requisitos

* Node.js 20+
* npm
* Cuenta/conexión a Neon
* Connection string configurado en `.env`

### Instalación

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd S08-26-equipo-5

# 2. Checkout de la rama de base de datos
git checkout feature/db-prisma-models

# 3. Ir al backend
cd apps/server

# 4. Copiar las variables de entorno
cp .env.example .env

# 5. Configurar DATABASE_URL en .env

# 6. Instalar dependencias
npm install

# 7. Generar Prisma Client
npx prisma generate

# 8. Verificar el estado de las migraciones
npx prisma migrate status

# 9. Abrir Prisma Studio
npx prisma studio
```

---

## Comandos

| Comando                     | Descripción                               |
| --------------------------- | ----------------------------------------- |
| `npm run dev`               | Iniciar servidor en desarrollo            |
| `npm run build`             | Compilar TypeScript                       |
| `npm run start`             | Ejecutar el build compilado               |
| `npx prisma studio`         | Abrir Prisma Studio                       |
| `npx prisma migrate dev`    | Crear y aplicar migraciones en desarrollo |
| `npx prisma migrate deploy` | Aplicar migraciones pendientes            |
| `npx prisma db seed`        | Ejecutar los seeds                        |
| `npx prisma generate`       | Regenerar Prisma Client                   |
| `npx prisma validate`       | Validar el schema de Prisma               |

---

## Seeds

Los seeds generan datos de prueba para desarrollo.

| Entidad       | Cantidad | Detalle                               |
| ------------- | -------: | ------------------------------------- |
| Usuarios      |        5 | Usuarios de prueba                    |
| Salas         |        3 | `PROGRAMADA`, `ACTIVA` y `FINALIZADA` |
| Participantes |        8 | Diferentes roles y estados            |

Los usuarios de prueba utilizan un mismo hash de contraseña para facilitar las pruebas durante el desarrollo.

> **Nota:** Las credenciales de prueba son únicamente para desarrollo y no deben utilizarse en producción.

---

## Variables de entorno

| Variable       | Descripción                     | Ejemplo                                          |
| -------------- | ------------------------------- | ------------------------------------------------ |
| `DATABASE_URL` | Connection string de PostgreSQL | `postgresql://user:pass@host/db?sslmode=require` |

> `.env` no debe incluirse en el repositorio.

---

## Convenciones

* **Branches:** `feature/<nombre>` desde `develop`.
* **Commits:** Conventional Commits 1.0.0.
* **Schema:** Prisma + PostgreSQL + UUID.
* **Timestamps:** `createdAt` y `updatedAt`.
* **Secrets:** nunca commitear `.env`.
* **Migraciones:** los cambios estructurales de la base de datos deben realizarse mediante migraciones de Prisma.

---

## Estado actual

Implementación inicial del modelo relacional del MVP:

* `Usuario`
* `Sala`
* `Participante`

La `Sala` representa la reunión concreta de MeetFlow. El historial se obtiene a partir de las salas finalizadas/canceladas y sus participantes, sin necesidad de una tabla `Historial` independiente.
