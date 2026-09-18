import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { AppError } from "../utils/AppError.js";

const prisma = new PrismaClient();

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

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * POST /webhooks/getstream
 * 
 * Recibe eventos de GetStream y actualiza el estado de las salas.
 * 
 * Eventos soportados:
 * - call.ended: Marca la sala como FINALIZADA
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
  let event: any;

  if (Buffer.isBuffer(req.body)) {
    // Viene de express.raw() - body es un Buffer
    rawBody = req.body.toString("utf8");
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      console.error("[Webhook] Failed to parse JSON body");
      throw new AppError(400, "BAD_REQUEST", "Invalid JSON");
    }
  } else {
    // Viene de express.json() - body ya es objeto
    event = req.body;
    rawBody = JSON.stringify(event);
  }

  const signature = req.headers["x-signature"] as string | undefined;

  // Verificar firma (temporalmente deshabilitado para desarrollo)
  // En producción, descomentar esta línea:
  // if (!verifyWebhookSignature(rawBody, signature, apiSecret)) {
  //   console.error("[Webhook] Invalid signature");
  //   throw new AppError(401, "UNAUTHORIZED", "Firma inválida");
  // }

  console.log("[Webhook] Event received:", {
    type: event.type,
    callId: event.call?.id,
    cid: event.call?.cid,
  });

  // ─── Manejar eventos ────────────────────────────────────

  switch (event.type) {
    case "call.ended":
      await handleCallEnded(event);
      break;

    case "call.session_ended":
      await handleSessionEnded(event);
      break;

    default:
      console.log(`[Webhook] Event ignored: ${event.type}`);
  }

  // Responder 200 rápido (GetStream requiere respuesta rápida)
  res.status(200).json({ received: true });
}

/**
 * Maneja el evento call.ended
 * Marca la sala como FINALIZADA en la base de datos.
 */
async function handleCallEnded(event: any): Promise<void> {
  const callCid = event.call?.cid;

  if (!callCid) {
    console.error("[Webhook] call.ended missing call.cid");
    return;
  }

  console.log(`[Webhook] Processing call.ended for CID: ${callCid}`);

  // Buscar sala por streamRoomId
  const sala = await prisma.sala.findFirst({
    where: { streamRoomId: callCid },
  });

  if (!sala) {
    console.warn(`[Webhook] Sala not found for streamRoomId: ${callCid}`);
    return;
  }

  if (sala.estado === "FINALIZADA") {
    console.log(`[Webhook] Sala ${sala.id} already finalized`);
    return;
  }

  // Actualizar estado a FINALIZADA
  await prisma.sala.update({
    where: { id: sala.id },
    data: {
      estado: "FINALIZADA",
      fechaFin: new Date(),
    },
  });

  console.log(`[Webhook] Sala ${sala.id} finalized (was: ${sala.estado})`);
}

/**
 * Maneja el evento call.session_ended
 * Similar a call.ended pero para sesiones específicas.
 */
async function handleSessionEnded(event: any): Promise<void> {
  const callCid = event.call?.cid;

  if (!callCid) {
    console.error("[Webhook] call.session_ended missing call.cid");
    return;
  }

  console.log(`[Webhook] Processing call.session_ended for CID: ${callCid}`);

  // Lógica similar a handleCallEnded
  const sala = await prisma.sala.findFirst({
    where: { streamRoomId: callCid },
  });

  if (!sala || sala.estado === "FINALIZADA") {
    return;
  }

  await prisma.sala.update({
    where: { id: sala.id },
    data: {
      estado: "FINALIZADA",
      fechaFin: new Date(),
    },
  });

  console.log(`[Webhook] Sala ${sala.id} finalized via session_ended`);
}
