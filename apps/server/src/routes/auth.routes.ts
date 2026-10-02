import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { validateBody } from "../middlewares/validateBody.js";
import { verifyToken } from "../middlewares/verifyToken.js";
import { PasswordResetController } from "../controllers/passwordReset.controller.js";
import { getMailer } from "../mail/index.js";
import { forgotEmailLimiter, forgotIpLimiter, resetTokenLimiter } from "../middlewares/rateLimit.js";
import { prisma } from "../config/prisma.js";
import { PrismaPasswordResetRepository } from "../repositories/passwordReset.repository.js";
import { PrismaUserRepository } from "../repositories/user.repository.js";
import { PrismaRefreshTokenRepository } from "../repositories/refreshToken.repository.js";
import { AuthService } from "../services/auth.service.js";

const userRepository = new PrismaUserRepository();
const refreshTokenRepository = new PrismaRefreshTokenRepository();
const authService = new AuthService(userRepository, refreshTokenRepository);
const authController = new AuthController(authService);

const passwordResetController = new PasswordResetController({
  users: userRepository,
  resets: new PrismaPasswordResetRepository(prisma),
  // Lazy: el mailer se resuelve al enviar (respeta MAIL_PROVIDER y los mocks de test).
  mailer: { send: (message) => getMailer().send(message) },
});

// Misma regla de contraseña que el registro.
const passwordRule = { field: "password", required: true, minLength: 8 };

const router = Router();

router.post(
  "/register",
  validateBody([
    { field: "nombre", required: true },
    { field: "apellido", required: true },
    { field: "email", required: true, email: true },
    passwordRule,
  ]),
  authController.register.bind(authController),
);

router.post(
  "/login",
  validateBody([
    { field: "email", required: true, email: true },
    { field: "password", required: true },
  ]),
  authController.login.bind(authController),
);

router.get("/me", verifyToken, authController.me.bind(authController));

router.post(
  "/logout",
  validateBody([{ field: "refreshToken", required: true }]),
  authController.logout.bind(authController),
);

router.post(
  "/refresh",
  validateBody([{ field: "refreshToken", required: true }]),
  authController.refresh.bind(authController),
);

// ─── Recuperación de contraseña (públicas, sin sesión) ───────
// Los limiters van antes del handler; el de email después de validar el body.
router.post(
  "/forgot-password",
  forgotIpLimiter,
  validateBody([{ field: "email", required: true, email: true }]),
  forgotEmailLimiter,
  passwordResetController.forgotPassword.bind(passwordResetController),
);

router.get(
  "/reset-password/:token",
  resetTokenLimiter,
  passwordResetController.validate.bind(passwordResetController),
);

router.post(
  "/reset-password/:token",
  resetTokenLimiter,
  validateBody([passwordRule]),
  passwordResetController.reset.bind(passwordResetController),
);

export default router;