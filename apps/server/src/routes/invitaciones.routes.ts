import { Router, Request, Response, NextFunction } from "express";
import { verifyToken } from "../middlewares/verifyToken.js";
import { inviteLimiter, tokenLimiter } from "../middlewares/rateLimit.js";
import {
  invitarASala,
  getInvitacion,
} from "../controllers/invitaciones.controller.js";

const router = Router();

/** Envuelve un handler async para que sus rechazos lleguen al errorMiddleware. */
function wrap(
  handler: (req: any, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

// Invitar por correo (solo HOST). El limiter va después de verifyToken para
// contar por host y no por IP.
router.post("/salas/:id/invitaciones", verifyToken, inviteLimiter, wrap(invitarASala));

// Vista previa pública del token (no lo consume). Limitada por IP contra
// fuerza bruta de tokens.
router.get("/invitaciones/:token", tokenLimiter, wrap(getInvitacion));

export default router;
