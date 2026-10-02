import { Router, Request, Response, NextFunction } from "express";
import { verifyToken, optionalVerifyToken } from "../middlewares/verifyToken.js";
import { inviteLimiter, tokenLimiter } from "../middlewares/rateLimit.js";
import {
  invitarASala,
  getInvitacion,
  aceptarInvitacionHandler,
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

// Aceptar: sesión opcional (la exige el servicio si la invitación es de una
// cuenta registrada). Mismo limiter por IP que el preview.
router.post(
  "/invitaciones/:token/aceptar",
  tokenLimiter,
  optionalVerifyToken,
  wrap(aceptarInvitacionHandler),
);

export default router;
