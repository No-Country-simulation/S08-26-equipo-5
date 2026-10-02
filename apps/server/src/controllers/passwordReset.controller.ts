import type { NextFunction, Request, Response } from "express";
import {
  RESPUESTA_FORGOT,
  restablecerPassword,
  solicitarReset,
  validarToken,
  type PasswordResetDeps,
} from "../services/passwordReset.service.js";

export class PasswordResetController {
  constructor(private readonly deps: PasswordResetDeps) {}

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await solicitarReset(this.deps, req.body.email);
      // Siempre lo mismo, exista o no la cuenta.
      res.status(200).json(RESPUESTA_FORGOT);
    } catch (err) {
      next(err);
    }
  }

  async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await validarToken(this.deps, String(req.params.token));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async reset(req: Request, res: Response, next: NextFunction) {
    try {
      await restablecerPassword(this.deps, String(req.params.token), req.body.password);
      res.status(200).json({ message: "Contraseña actualizada" });
    } catch (err) {
      next(err);
    }
  }
}
