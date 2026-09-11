import express from "express";
import roomsRoutes from "./routes/rooms.routes.js";
import { errorHandler } from "./middlewares/error-handler.js";

const app = express();

// ─── Global Middlewares ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check ────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────────────
app.use("/api", roomsRoutes);

// ─── 404 handler ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Error handler ───────────────────────────────────────
app.use(errorHandler);

export default app;
