import type { NextFunction, Request, Response } from "express";
import {
  RESPUESTA_FORGOT,
  restablecerPassword,
  solicitarReset,
  validarToken,
  type PasswordResetDeps,
} from "../services/passwordReset.service.js";

/** Ejecuta la tarea fuera del ciclo del request. Inyectable para que los tests la esperen. */
export type Scheduler = (task: () => Promise<void>) => void;

/** Detached: nunca rechaza; solo el nombre del error se loguea (sin email ni mensajes de la base). */
const detached: Scheduler = (task) => {
  void task().catch((error: unknown) => {
    const nombre = error instanceof Error ? error.name : "desconocido";
    console.error(`[password-reset] falló el procesamiento del pedido: ${nombre}`);
  });
};

export class PasswordResetController {
  constructor(
    private readonly deps: PasswordResetDeps,
    private readonly schedule: Scheduler = detached,
  ) {}

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      // Se captura antes de responder; la búsqueda, la transacción y el correo
      // corren después, así el tiempo de respuesta no depende de si la cuenta existe.
      const email: string = req.body.email;
      res.status(200).json(RESPUESTA_FORGOT);
      this.schedule(() => solicitarReset(this.deps, email));
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
