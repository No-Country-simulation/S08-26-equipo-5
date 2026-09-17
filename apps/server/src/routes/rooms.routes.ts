import { Router } from "express";
import { createRoom, generateToken } from "../controllers/rooms.controller.js";

const router = Router();

// ─── POST /rooms — Crear sala ─────────────────────────────
router.post("/rooms", (req, res, next) => {
  createRoom(req, res).catch(next);
});

// ─── POST /rooms/:id/token — Generar token ────────────────
router.post("/rooms/:id/token", (req, res, next) => {
  generateToken(req, res).catch(next);
});

export default router;
