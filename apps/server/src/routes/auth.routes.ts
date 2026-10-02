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

// RFC 5321: 254 caracteres es el máximo de una dirección. Frena payloads enormes
// antes de los limiters y de la base.
const emailRule = { field: "email", required: true, email: true, maxLength: 254 };

// Contraseña nueva (registro y restablecimiento): bcrypt solo usa los primeros 72
// bytes, así que más largo es engañoso y un vector de CPU. No se aplica al login
// (cuentas viejas) para no bloquear a nadie.
const passwordRule = {
  field: "password",
  required: true,
  minLength: 8,
  maxBytes: 72,
  maxBytesMessage: "La contraseña no puede superar 72 bytes",
};

const router = Router();

router.post(
  "/register",
  validateBody([
    { field: "nombre", required: true },
    { field: "apellido", required: true },
    emailRule,
    passwordRule,
  ]),
  authController.register.bind(authController),
);

router.post(
  "/login",
  validateBody([
    emailRule,
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
// Se valida primero (un body inválido es barato y no consume cupo); el limiter
// por email necesita el body ya validado.
router.post(
  "/forgot-password",
  validateBody([emailRule]),
  forgotIpLimiter,
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