import { Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env.js";
import {
  processGetStreamEvent,
  type GetStreamWebhookEvent,
} from "../services/webhook.service.js";
import { AppError } from "../utils/AppError.js";

/**
 * Verifica la firma HMAC del webhook de GetStream.
 * GetStream firma cada request con HMAC-SHA256 usando el API Secret.
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  apiSecret: string
): boolean {
  if (!signature) {
    console.error("[Webhook] Missing X-Signature header");
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", apiSecret)
    .update(rawBody)
    .digest("hex");

  const signatureBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  // timingSafeEqual THROWS si las longitudes difieren: comparar antes.
  if (signatureBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuf, expectedBuf);
}

/**
 * POST /webhooks/getstream
 *
 * Recibe eventos de GetStream y actualiza el estado de las salas.
 * La lógica de negocio vive en webhook.service; acá solo se valida
 * la firma HMAC y se delega.
 */
export async function handleGetStreamWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const apiSecret = process.env.GETSTREAM_API_SECRET;

  if (!apiSecret) {
    console.error("[Webhook] GETSTREAM_API_SECRET not configured");
    throw new AppError(500, "CONFIG_ERROR", "Webhook no configurado");
  }

  // Obtener body raw para verificar firma
  // express.raw() guarda el body como Buffer en req.body
  let rawBody: string;
  let event: GetStreamWebhookEvent;

  if (Buffer.isBuffer(req.body)) {
    // Viene de express.raw() - body es un Buffer
    rawBody = req.body.toString("utf8");
    try {
      event = JSON.parse(rawBody);
    } catch {
      console.error("[Webhook] Failed to parse JSON body");
      throw new AppError(400, "BAD_REQUEST", "Invalid JSON");
    }
  } else {
    // Viene de express.json() - body ya es objeto
    event = req.body;
    rawBody = JSON.stringify(event);
  }

  const signature = req.headers["x-signature"] as string | undefined;

  // Firma HMAC: requerida por defecto en producción (fail-closed vía
  // env.webhookSignatureRequired). Con WEBHOOK_SIGNATURE_REQUIRED=false
  // (solo desarrollo local) se omite la verificación, como hasta ahora.
  if (env.webhookSignatureRequired) {
    if (!verifyWebhookSignature(rawBody, signature, apiSecret)) {
      console.error("[Webhook] Invalid signature");
      throw new AppError(401, "UNAUTHORIZED", "Firma inválida o ausente");
    }
  } else {
    console.warn(
      "[Webhook] Signature verification skipped (WEBHOOK_SIGNATURE_REQUIRED=false)"
    );
  }

  console.log("[Webhook] Event received:", {
    type: event.type,
    callId: event.call?.cid,
  });

  await processGetStreamEvent(event);

  // Responder 200 rápido (GetStream requiere respuesta rápida)
  res.status(200).json({ received: true });
}
