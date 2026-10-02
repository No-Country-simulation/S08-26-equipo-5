# Gate S3-08 — GetStream server-side hardening

**Fecha:** 2026-09-23

Gate original: 22/09/2026 — este registro cierra los criterios pendientes en la fecha indicada.

## Criterios de aceptación

- [x] **C1 — JWT inválido no obtiene token** ✅
  - **Cierra:** commit `7a02911`
  - **Evidencia:** `verifyToken` en `POST /rooms/:id/token`; tests 401 para token ausente, expirado y secret incorrecto.

- [x] **C2 — Permisos host/participante server-side** ✅
  - **Cierra:** commit `7a02911` (+ guards realtime de PR #79)
  - **Evidencia:** rol derivado desde DB; 403 no-participante y no-APROBADO; `isHost` gates en CRUD de salas; guards server-side en realtime (PR #79).

- [x] **C3 — Webhooks MVC** ✅
  - **Cierra:** commit `5940df8`
  - **Evidencia:** `webhook.service.ts`; HMAC fail-closed en prod vía `WEBHOOK_SIGNATURE_REQUIRED`; tests de firma válida, inválida, ausente y JSON malformado.

- [x] **C4 — Transferencia de rol** ✅
  - **Cierra:** commit `f381b27`
  - **Evidencia:** `POST /salas/:id/transfer-host` con guard host + `$transaction`; 5 tests.

- [ ] **C5 — PR mergeado con CI verde** ⚠️
  - **Estado:** en curso — este workflow (`ci.yml`) habilita build+tests en PRs a develop; se cierra al mergear este PR.
  - **PR:** _pendiente (sin número aún)_
  - **Cierra:** commit `ci`

## Resultados de verificación

- `npm test` (2026-09-23): **47/47 tests pasaron**, 4 archivos de test, exit 0.
- `npm run build` (tsc): exit **0**.

## Riesgos conocidos para reviewer

1. **Webhook:** el parseo JSON ocurre antes de la verificación de firma en cierto camino — revisar orden en `webhook.controller.ts`.
2. **Transfer-host:** un `target` con estado PENDIENTE califica para la transferencia (decisión de diseño, no bug).
3. **Env gate:** `webhookSignatureRequired` depende de `NODE_ENV=production` en runtime — en dev queda en `false` salvo override explícito.
