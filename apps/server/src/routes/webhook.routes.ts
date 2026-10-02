import { Router } from "express";
import { handleGetStreamWebhook } from "../controllers/webhook.controller.js";

const router = Router();

// ─── POST /webhooks/getstream — Recibir eventos de GetStream ─
// Nota: Este endpoint NO requiere auth middleware porque GetStream
// lo llama directamente. La verificación se hace por firma HMAC.
router.post("/getstream", (req, res, next) => {
  handleGetStreamWebhook(req, res).catch(next);
});

export default router;
