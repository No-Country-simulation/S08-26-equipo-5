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
  transferHost,
} from "../controllers/rooms.controller.js";

const router = Router();

// ─── Rutas protegidas con path literal (auth JWT) ─────────
// IMPORTANTE: deben registrarse ANTES de "/salas/:code" (público),
// porque Express matchea rutas en orden y ":code" capturaría literales
// como "mis-participaciones" (ver issue #33 — bug de agenda inalcanzable).

// Crear sala
router.post("/salas", verifyToken, (req: Request, res: Response, next) => {
  createSala(req, res).catch(next);
});

// Agenda del usuario: todas las salas donde participo (HOST o PARTICIPANTE)
router.get("/salas/mis-participaciones", verifyToken, (req: Request, res: Response, next) => {
  getMisParticipaciones(req, res).catch(next);
});

// ─── Rutas públicas (sin auth) ────────────────────────────
router.get("/salas/:code", (req: Request, res: Response, next) => {
  getSalaByCode(req as Request<{ code: string }>, res).catch(next);
});

// ─── Rutas protegidas con parámetros dinámicos ────────────

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

// Transferir rol HOST (solo HOST actual)
router.post("/salas/:id/transfer-host", verifyToken, (req: Request, res: Response, next) => {
  transferHost(req as Request<{ id: string }>, res).catch(next);
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
