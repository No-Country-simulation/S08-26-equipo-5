import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { UsuariosController } from "../controllers/usuarios.controller.js";
import { createLimiter } from "../middlewares/rateLimit.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import { PrismaUserRepository } from "../repositories/user.repository.js";
import { UsuarioFotoService } from "../services/usuarioFoto.service.js";
import { UsuarioPerfilService } from "../services/usuarioPerfil.service.js";
import { createImageStorage } from "../storage/cloudinary.storage.js";
import { AppError } from "../utils/AppError.js";

export interface UsuariosRouterDeps {
  service: UsuarioFotoService;
  perfil?: UsuarioPerfilService;
  maxBytes: number;
  /** Máximo de operaciones de foto por usuario cada 15 minutos. */
  rateLimitMax: number;
}

export function createUsuariosRouter({ service, perfil, maxBytes, rateLimitMax }: UsuariosRouterDeps): Router {
  const controller = new UsuariosController(service, perfil);

  // memoryStorage: nunca se escribe a disco. `fileSize` corta el stream en
  // cuanto se excede el máximo (no se bufferea un archivo gigante).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2 },
  }).single("foto");

  // Clave por usuario (va detrás de verifyToken); 429 con formato AppError.
  const limiter = createLimiter({ max: rateLimitMax, skip: false });

  // 503 antes de procesar el multipart: sin proveedor no tiene sentido bufferear el archivo.
  const requireUploads = (_req: Request, _res: Response, next: NextFunction) => {
    try {
      service.assertEnabled();
      next();
    } catch (err) {
      next(err);
    }
  };

  const parseFoto = (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err?: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(413, "FILE_TOO_LARGE", `La imagen supera el máximo de ${maxBytes} bytes`),
          );
        }
        // Campo equivocado, partes de más, etc.
        return next(new AppError(400, "VALIDATION_ERROR", "Se requiere una imagen"));
      }
      // Errores de busboy (no son MulterError): "Unexpected end of form",
      // "Boundary not found", "Malformed part header"... Con memoryStorage el
      // único origen posible es un cuerpo multipart mal formado del cliente.
      next(new AppError(400, "VALIDATION_ERROR", "El cuerpo multipart es inválido"));
    });
  };

  const router = Router();

  if (perfil) {
    router.patch("/usuarios/me", verifyToken, controller.updatePerfil.bind(controller));
  }

  router.put(
    "/usuarios/me/foto",
    verifyToken,
    limiter,
    requireUploads,
    parseFoto,
    controller.setFoto.bind(controller),
  );

  router.delete(
    "/usuarios/me/foto",
    verifyToken,
    limiter,
    controller.removeFoto.bind(controller),
  );

  return router;
}

/** Cableado real (Prisma + Cloudinary). Se arma al crear la app. */
export function buildUsuariosRouter(): Router {
  const service = new UsuarioFotoService(
    new PrismaUserRepository(),
    createImageStorage({ cloudinaryUrl: env.cloudinaryUrl, folder: env.cloudinaryFolder }),
    { maxBytes: env.avatarMaxBytes },
  );
  return createUsuariosRouter({
    service,
    perfil: new UsuarioPerfilService(new PrismaUserRepository()),
    maxBytes: env.avatarMaxBytes,
    rateLimitMax: env.rateLimitAvatarMax,
  });
}
