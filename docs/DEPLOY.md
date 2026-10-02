# Despliegue continuo (CD) — Vercel + Render

Guía para desplegar la app en producción de forma gratuita.

| Componente     | Plataforma | Plan | Cómo se despliega |
| -------------- | ---------- | ---- | ----------------- |
| Frontend       | Vercel     | Hobby | Vercel CLI desde GitHub Actions |
| Backend (API)  | Render     | Free  | Docker + deploy hook desde GitHub Actions |
| Base de datos  | Neon       | Free  | Ya provisionada (no se despliega) |

> **¿Por qué Vercel por CLI y no Git integration?**
> El repo pertenece a la organización de GitHub `No-Country-simulation`. El plan
> Hobby de Vercel **no permite conectar repos de organizaciones** vía Git. El
> deploy por CLI con un token funciona igual y es gratis.

El flujo completo (`.github/workflows/deploy.yml`) al hacer push a `main`:

```
push a main (apps/**)
        │
        ├── migrate ─ Prisma migrate deploy (Neon)
        │       └── deploy-server ─ POST deploy hook → Render construye la imagen Docker
        │
        └── deploy-web ─ vercel pull / build / deploy --prebuilt --prod
```

---

## 1. Prerrequisitos

- Plan gratuito en [Render](https://render.com) y [Vercel](https://vercel.com).
- Acceso de administrador al repo de GitHub para cargar secrets.
- `DATABASE_URL` de Neon (ya la usas en local).

---

## 2. Backend en Render (Blueprint)

1. En el dashboard de Render: **New > Blueprint**.
2. Conecta el repo `S08-26-equipo-5`. Render detectará `render.yaml` en la raíz.
3. Completa las variables que pide el Blueprint (`sync: false`):
   - `DATABASE_URL`: connection string de Neon.
   - `CORS_ORIGIN`: la URL de producción de Vercel, p. ej. `https://meetflow-web.vercel.app` (sin slash final).
4. Crea el servicio. Render generará `JWT_SECRET` automáticamente.
5. Espera el primer deploy y verifica:

   ```bash
   curl https://meetflow-server.onrender.com/api/v1/health
   # {"status":"success","message":"Backend operativo", ...}
   ```

6. **Deploy hook** (para que CI dispare el deploy):
   - Entra al servicio > **Settings > Deploy Hook** > copia la URL.
   - Esa URL va al secret `RENDER_DEPLOY_HOOK_URL` en GitHub (paso 4).

> El Blueprint usa `autoDeployTrigger: off`: Render **no** despliega solo; lo
> hace el workflow después de aplicar migraciones. La imagen se construye desde
> el target `runner` de `apps/server/Dockerfile`.

---

## 3. Frontend en Vercel (CLI)

Requiere hacerlo **una sola vez** desde una máquina con Node:

```bash
npm i -g vercel
cd apps/web
vercel login
vercel link            # crea un proyecto nuevo (no uses la Git integration)
```

Configura la variable de entorno de producción (apunta al backend de Render):

```bash
vercel env add NEXT_PUBLIC_API_URL production
# valor: https://meetflow-server.onrender.com
```

Verifica el proyecto y guarda los IDs para CI:

```bash
vercel project inspect --non-interactive
cat .vercel/project.json   # contiene projectId y orgId
```

> El `projectId` y `orgId` van a los secrets `VERCEL_PROJECT_ID` y
> `VERCEL_ORG_ID`. El `VERCEL_TOKEN` se genera en
> https://vercel.com/account/tokens.

---

## 4. Secrets en GitHub

En **Settings > Secrets and variables > Actions > New repository secret**:

| Secret                    | Valor |
| ------------------------- | ----- |
| `DATABASE_URL`            | Connection string de Neon (para migraciones) |
| `RENDER_DEPLOY_HOOK_URL`  | Deploy hook del servicio de Render |
| `VERCEL_TOKEN`            | Token personal de Vercel |
| `VERCEL_ORG_ID`           | `orgId` de `apps/web/.vercel/project.json` |
| `VERCEL_PROJECT_ID`       | `projectId` de `apps/web/.vercel/project.json` |

---

## 5. Flujo de deploy

- **CI (PR):** `.github/workflows/docker.yml` valida el compose y construye las
  imágenes dev/prod. No despliega.
- **CD (push a `main`):** `.github/workflows/deploy.yml` aplica migraciones,
  despliega el server en Render y el web en Vercel.
- **Manual:** pestaña **Actions > Deploy > Run workflow** (`workflow_dispatch`).

---

## 6. Verificación y rollback

- API: `GET https://meetflow-server.onrender.com/api/v1/health`.
- Web: abre la URL de producción de Vercel.
- **Rollback Render:** dashboard > servicio > **Events**, redeploy de un build anterior.
- **Rollback Vercel:** `vercel rollback` o desde el dashboard.

---

## 7. Notas del plan gratuito

- **Render Free duerme** el servicio tras 15 min sin tráfico; el primer request
  tarda ~1 min en despertar. Para las demos, mantén el backend caliente con un
  ping externo (p. ej. [cron-job.org](https://cron-job.org)) a
  `/api/v1/health` cada 10 min.
- **CORS:** `CORS_ORIGIN` acepta un único origen. Las **preview deployments** de
  Vercel usan otro dominio y no pasarán CORS hasta que se soporte una lista de
  orígenes (mejora pendiente). Producción no se ve afectada.
- **GetStream:** el video no pasa por Render ni Vercel; se conecta directo al
  edge network de Stream. El backend solo emite tokens, así que el free alcanza.
