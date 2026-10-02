import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { nodeEnv: "test", rateLimitInviteMax: 30, rateLimitTokenMax: 30 },
}));

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createLimiter } from "../middlewares/rateLimit.js";
import { errorMiddleware } from "../middlewares/error.middleware.js";

function appConEsquema(opts: { max: number; skip?: boolean }) {
  const app = express();
  app.use(createLimiter({ max: opts.max, skip: opts.skip ?? false }));
  app.get("/x", (_req, res) => res.json({ ok: true }));
  app.use(errorMiddleware);
  return app;
}

describe("createLimiter", () => {
  it("excedido el limite responde 429 RATE_LIMITED con formato AppError", async () => {
    const app = appConEsquema({ max: 2 });

    await request(app).get("/x").expect(200);
    await request(app).get("/x").expect(200);
    const res = await request(app).get("/x");

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(typeof res.body.error.message).toBe("string");
  });

  it("con skip=true nunca limita", async () => {
    const app = appConEsquema({ max: 1, skip: true });

    for (let i = 0; i < 4; i++) {
      await request(app).get("/x").expect(200);
    }
  });

  it("con usuario autenticado el contador es por usuario, no por IP", async () => {
    // Mismo store; un middleware previo cambia el usuario entre requests.
    const app = express();
    let actual = "host-a";
    app.use((req, _res, next) => {
      req.user = { sub: actual, email: "x@x.com" };
      next();
    });
    app.use(createLimiter({ max: 1, skip: false }));
    app.get("/x", (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);

    await request(app).get("/x").expect(200);
    await request(app).get("/x").expect(429);
    actual = "host-b";
    await request(app).get("/x").expect(200);
  });
});

describe("createLimiter con keyGenerator propio", () => {
  it("cuenta por la clave provista: mismo email comparte contador aunque cambie la IP", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createLimiter({
        max: 1,
        skip: false,
        keyGenerator: (req) => `email:${String(req.body?.email ?? "").toLowerCase()}`,
      }),
    );
    app.post("/x", (_req, res) => res.json({ ok: true }));
    app.use(errorMiddleware);

    await request(app).post("/x").send({ email: "A@x.com" }).expect(200);
    await request(app).post("/x").send({ email: "a@x.com" }).expect(429);
    await request(app).post("/x").send({ email: "b@x.com" }).expect(200);
  });
});

describe("limiters configurados por env", () => {
  it("inviteLimiter y tokenLimiter se saltan bajo NODE_ENV=test", async () => {
    const { inviteLimiter, tokenLimiter } = await import("../middlewares/rateLimit.js");
    const app = express();
    app.use(inviteLimiter);
    app.use(tokenLimiter);
    app.get("/x", (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 40; i++) {
      await request(app).get("/x").expect(200);
    }
  });
});
