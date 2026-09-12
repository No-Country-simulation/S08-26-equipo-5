import type { NextFunction, Request, Response } from "express";
import type { AuthService } from "../services/auth.service.js";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.authService.register(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.authService.login(req.body);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await this.authService.refresh(req.body.refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      await this.authService.logout(req.body.refreshToken);
      res.status(200).json({ message: "Sesión cerrada exitosamente" });
    } catch (err) {
      next(err);
    }
  }
}