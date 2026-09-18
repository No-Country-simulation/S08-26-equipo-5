import { Router } from "express";
import { verifyToken } from "../middlewares/verifyToken.js";
import {
  createSala,
  getSalaByCode,
  getMisSalas,
  getSalasProgramadas,
  getSalaDetalle,
  updateSala,
  deleteSala,
  getParticipantes,
  generateToken,
} from "../controllers/rooms.controller.js";

const router = Router();

// ─── Rutas públicas (sin auth) ────────────────────────────
router.get("/salas/:code", (req, res, next) => {
  getSalaByCode(req, res).catch(next);
});

// ─── Rutas protegidas (requieren auth JWT) ────────────────

// Crear sala
router.post("/salas", verifyToken, (req, res, next) => {
  createSala(req, res).catch(next);
});

// Mis salas (donde soy HOST)
router.get("/salas/mis-salas/list", verifyToken, (req, res, next) => {
  getMisSalas(req, res).catch(next);
});

// Salas programadas/futuras
router.get("/salas/programadas/list", verifyToken, (req, res, next) => {
  getSalasProgramadas(req, res).catch(next);
});

// Detalle de sala (con participantes)
router.get("/salas/:id/detalle", verifyToken, (req, res, next) => {
  getSalaDetalle(req, res).catch(next);
});

// Actualizar sala (solo HOST)
router.put("/salas/:id", verifyToken, (req, res, next) => {
  updateSala(req, res).catch(next);
});

// Cancelar sala (solo HOST)
router.delete("/salas/:id", verifyToken, (req, res, next) => {
  deleteSala(req, res).catch(next);
});

// Lista de participantes
router.get("/salas/:id/participantes", verifyToken, (req, res, next) => {
  getParticipantes(req, res).catch(next);
});

// ─── Rutas legacy ─────────────────────────────────────────
router.post("/rooms/:id/token", (req, res, next) => {
  generateToken(req, res).catch(next);
});

export default router;
