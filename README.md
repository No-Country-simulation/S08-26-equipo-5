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

## Ramas / Flujo de trabajo

- `main`: estable, siempre desplegable.
- Por feature/issue: sigue los templates de `.github/`.
