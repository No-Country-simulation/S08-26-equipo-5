import { Router, Request, Response, NextFunction } from "express";
import { verifyToken, optionalVerifyToken } from "../middlewares/verifyToken.js";
import { authParticipante } from "../middlewares/authParticipante.js";
import {
  createSala,
  getSalaByCode,
  getMisParticipaciones,
  getSalaDetalle,
  updateSala,
  deleteSala,
  getParticipantes,
  generateToken,
  transferHost,
  joinSala,
  getStreamToken,
  getMiEstado,
} from "../controllers/rooms.controller.js";

const router = Router();

/** Envuelve un handler async para que sus rechazos lleguen al errorMiddleware. */
function wrap(
  handler: (req: any, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

// ─── Rutas protegidas con path literal ────────────────────
// IMPORTANTE: van ANTES de "/salas/:code". Express resuelve por orden de
// registro, así que si la paramétrica se declara primero captura
// "mis-participaciones" como si fuera un código de sala.

// Crear sala
router.post("/salas", verifyToken, wrap(createSala));

// Mis participaciones (todas las salas donde soy participante)
router.get("/salas/mis-participaciones", verifyToken, wrap(getMisParticipaciones));

// ─── Rutas por salaId ─────────────────────────────────────

// Detalle de sala (con participantes)
router.get("/salas/:id/detalle", verifyToken, wrap(getSalaDetalle));

// Transferir rol HOST (solo HOST actual)
router.post("/salas/:id/transfer-host", verifyToken, (req: Request, res: Response, next) => {
  transferHost(req as Request<{ id: string }>, res).catch(next);
});

// Lista de participantes
router.get("/salas/:id/participantes", verifyToken, wrap(getParticipantes));

// Token de GetStream — HOST con access token o invitado con guest JWT
router.post(
  "/salas/:salaId/stream-token",
  authParticipante(),
  wrap(getStreamToken),
);

// Estado del participante — sirve para recuperar la sesión tras un refresh
router.get(
  "/salas/:salaId/mi-estado",
  authParticipante({ requireApproved: false }),
  wrap(getMiEstado),
);

// Actualizar sala (solo HOST)
router.put("/salas/:id", verifyToken, wrap(updateSala));

// Cancelar sala (solo HOST)
router.delete("/salas/:id", verifyToken, wrap(deleteSala));

// ─── Rutas públicas por código ────────────────────────────

// Solicitar ingreso a la sala de espera (sin auth: el invitado no tiene cuenta)
router.post("/salas/:code/join", optionalVerifyToken, wrap(joinSala));

// Consulta pública de la sala
router.get("/salas/:code", wrap(getSalaByCode));

// ─── Rutas legacy ─────────────────────────────────────────
// @deprecated Alias de POST /salas/:salaId/stream-token para no romper
// clientes viejos (apps/web sigue llamando a /rooms/:id/token). El param se
// llama `salaId` (no `id`) a propósito: authParticipante lee req.params.salaId
// y reutiliza exactamente la misma lógica segura (rol/usuario salen de la
// DB vía el middleware, nunca del body). Preferir el endpoint nuevo.
router.post(
  "/rooms/:salaId/token",
  authParticipante(),
  wrap(generateToken),
);

export default router;
