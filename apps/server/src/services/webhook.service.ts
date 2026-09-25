import { prisma } from "../config/prisma.js";

export interface GetStreamWebhookEvent {
  type?: string;
  call?: { cid?: string };
}

/**
 * Procesa un evento de GetStream YA validado (la firma HMAC se
 * verifica en el controller antes de llegar acá).
 *
 * Eventos soportados:
 * - call.ended: marca la sala como FINALIZADA.
 * - call.session_ended: NO finaliza la sala (ver nota abajo), solo se loguea.
 */
export async function processGetStreamEvent(
  event: GetStreamWebhookEvent
): Promise<void> {
  switch (event.type) {
    case "call.ended":
      await finalizeSala(event.type, event.call?.cid);
      break;

    case "call.session_ended":
      // A propósito, NO finaliza la sala acá: `session_ended` dispara
      // también cuando el host queda momentáneamente solo en la call (por
      // ejemplo, llega antes que los invitados o se le corta la conexión un
      // instante). Si finalizáramos la sala en ese evento, la dejaríamos
      // FINALIZADA y los invitados que llegan después quedarían afuera sin
      // poder reingresar. Solo `call.ended` (el host la termina de verdad)
      // marca la sala como FINALIZADA.
      console.log(
        `[Webhook] call.session_ended para ${event.call?.cid} — la sala sigue activa`
      );
      break;

    default:
      console.log(`[Webhook] Event ignored: ${event.type}`);
  }
}

/**
 * Busca la sala por streamRoomId (cid de GetStream) y la marca FINALIZADA.
 * Idempotente: si ya está FINALIZADA no hace nada.
 */
async function finalizeSala(
  type: string,
  callCid: string | undefined
): Promise<void> {
  if (!callCid) {
    console.error(`[Webhook] ${type} missing call.cid`);
    return;
  }

  console.log(`[Webhook] Processing ${type} for CID: ${callCid}`);

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

  await prisma.sala.update({
    where: { id: sala.id },
    data: {
      estado: "FINALIZADA",
      fechaFin: new Date(),
    },
  });

  console.log(`[Webhook] Sala ${sala.id} finalized (was: ${sala.estado})`);
}
