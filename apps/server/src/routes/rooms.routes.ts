import { Router, Request, Response } from "express";
import { verifyToken } from "../middlewares/verifyToken.js";
import {
  createSala,
  getSalaByCode,
  getMisParticipaciones,
  getSalaDetalle,
  updateSala,
  deleteSala,
  getParticipantes,
  generateToken,
} from "../controllers/rooms.controller.js";

const router = Router();

// ─── Rutas públicas (sin auth) ────────────────────────────
router.get("/salas/:code", (req: Request, res: Response, next) => {
  getSalaByCode(req as Request<{ code: string }>, res).catch(next);
});

// ─── Rutas protegidas (requieren auth JWT) ────────────────

// Crear sala
router.post("/salas", verifyToken, (req: Request, res: Response, next) => {
  createSala(req, res).catch(next);
});

// Mis participaciones (todas las salas donde soy participante)
router.get("/salas/mis-participaciones", verifyToken, (req: Request, res: Response, next) => {
  getMisParticipaciones(req, res).catch(next);
});

// Detalle de sala (con participantes)
router.get("/salas/:id/detalle", verifyToken, (req: Request, res: Response, next) => {
  getSalaDetalle(req as Request<{ id: string }>, res).catch(next);
});

// Actualizar sala (solo HOST)
router.put("/salas/:id", verifyToken, (req: Request, res: Response, next) => {
  updateSala(req as Request<{ id: string }>, res).catch(next);
});

// Cancelar sala (solo HOST)
router.delete("/salas/:id", verifyToken, (req: Request, res: Response, next) => {
  deleteSala(req as Request<{ id: string }>, res).catch(next);
});

// Lista de participantes
router.get("/salas/:id/participantes", verifyToken, (req: Request, res: Response, next) => {
  getParticipantes(req as Request<{ id: string }>, res).catch(next);
});

// ─── Rutas legacy ─────────────────────────────────────────
// Generar token GetStream (requiere JWT; rol resuelto en DB)
router.post("/rooms/:id/token", verifyToken, (req: Request, res: Response, next) => {
  generateToken(req as Request<{ id: string }>, res).catch(next);
});

export default router;
