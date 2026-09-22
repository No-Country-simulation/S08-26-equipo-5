import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import roomsRoutes from "./routes/rooms.routes.js";
import authRoutes from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { AppError } from "./utils/AppError.js";
import { openApiSpec } from "./docs/openapi.js";

export function createApp() {
  const app = express();

  // CSP se desactiva porque el bundle de swagger-ui-express usa estilos/scripts
  // inline que Helmet bloquearía por defecto.
  app.use(helmet({ contentSecurityPolicy: false }));
  
  // Parse CORS_ORIGIN como array (separado por comas)
  const allowedOrigins = env.corsOrigin.split(",").map(o => o.trim());
  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  }));

  // ─── Webhook raw body (necesario para verificación de firma) ─
  app.use("/webhooks", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });

  // ─── Documentación Swagger ────────────────────────────────
  app.use(
    "/api/v1/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: "MeetFlow API Docs",
    }),
  );
  app.get("/api/v1/docs.json", (_req, res) => {
    res.json(openApiSpec);
  });

  // ─── API Routes ──────────────────────────────────────────
  app.use("/api/v1", healthRoutes);
  app.use("/api/v1/auth", authLimiter, authRoutes);
  app.use("/api/v1", roomsRoutes);

  // ─── Webhook Routes (sin auth, con verificación HMAC) ────
  app.use("/webhooks", webhookRoutes);

  // ─── 404 handler ─────────────────────────────────────────
  app.use((_req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", "Recurso no encontrado"));
  });

  // ─── Error handler ───────────────────────────────────────
  app.use(errorMiddleware);

  return app;
}
