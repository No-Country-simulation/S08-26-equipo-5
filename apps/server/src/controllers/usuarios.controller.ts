import type { NextFunction, Request, Response } from "express";
import type { UsuarioFotoService } from "../services/usuarioFoto.service.js";

export class UsuariosController {
  constructor(private readonly fotoService: UsuarioFotoService) {}

  async setFoto(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file ? { buffer: req.file.buffer, size: req.file.size } : undefined;
      const result = await this.fotoService.setFoto(req.user!.sub, file);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async removeFoto(req: Request, res: Response, next: NextFunction) {
    try {
      await this.fotoService.removeFoto(req.user!.sub);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
}
