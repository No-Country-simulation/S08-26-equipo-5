# S08-26 Equipo 5

Repositorio base (monorepo) del equipo.

## Stack

- **Frontend** (`apps/web`): Next.js + React + Tailwind CSS
- **Backend** (`apps/server`): Node.js + Express
- **QA**: Por definir
- **Diseño**: Figma

## Estructura

| Carpeta         | Responsable  | Propósito                                        |
| --------------- | ------------ | ------------------------------------------------ |
| `apps/web`      | Frontend     | Aplicación web Next.js + React                   |
| `apps/server`   | Backend      | API Node.js + Express                            |
| `qa`            | QA           | Carpeta de QA                                    |
| `design`        | Diseñadora    | Links de Figma, design tokens y recursos        |
| `docs`          | PM           | Guías de arquitectura y onboarding                |
| `.github`       | Por definir | Templates de issues, PRs y workflows de CI/CD     |

## Primeros pasos

Cada integrante trabaja en su propia carpeta. Consulta `docs/` para el onboarding.

## Docker (desarrollo local)

Requisitos: Docker Desktop (o Docker Engine + Compose) y `apps/server/.env` con `DATABASE_URL` y `JWT_SECRET` (copia `apps/server/.env.example`).

Desde `apps/`:

```bash
cd apps

docker compose up --build       # levanta web (3000) y server (4000)
docker compose logs -f          # ver logs
docker compose down             # detener
docker compose up --build server  # reconstruir solo un servicio
```

- Web: http://localhost:3000
- API health: http://localhost:4000/api/v1/health
- El server aplica `prisma migrate deploy` al iniciar (usa la `DATABASE_URL` de Neon).

Si cambias dependencias en `package.json`, basta con reconstruir: el entrypoint detecta el cambio y corre `npm ci` solo una vez.

```bash
docker compose up --build
```

El CI (`.github/workflows/docker.yml`) construye los targets de desarrollo y producción en cada PR que toque `apps/`.

## Despliegues

| Componente | URL |
| ---------- | --- |
| Frontend (Vercel) | https://web-ruddy-mu-22.vercel.app |
| API health (Render) | https://meetflow-server-tm9i.onrender.com/api/v1/health |

## Despliegue continuo (CD)

Al hacer push a `develop` (con cambios en `apps/`), `.github/workflows/deploy.yml`:

- aplica las migraciones de Prisma contra Neon,
- despliega la API en **Render** (`render.yaml`, Docker target `runner`),
- despliega el frontend en **Vercel** (CLI, plan Hobby).

Guía completa, secrets requeridos y notas del plan gratuito: [`docs/DEPLOY.md`](docs/DEPLOY.md).


## Ramas / Flujo de trabajo

- `main`: estable, siempre desplegable.
- Por feature/issue: sigue los templates de `.github/`.
