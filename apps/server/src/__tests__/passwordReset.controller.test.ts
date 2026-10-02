import { vi } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { frontendUrl: "http://front.test", passwordResetTtlMinutes: 30, bcryptSaltRounds: 4 },
}));

import { describe, expect, it } from "vitest";
import { PasswordResetController } from "../controllers/passwordReset.controller.js";
import type { PasswordResetDeps } from "../services/passwordReset.service.js";

function crear() {
  const users = { findByEmailInsensitive: vi.fn().mockResolvedValue(null) };
  const deps = { users, resets: {}, mailer: { send: vi.fn() } } as unknown as PasswordResetDeps;
  const tareas: Array<() => Promise<void>> = [];
  const controller = new PasswordResetController(deps, (tarea) => tareas.push(tarea));
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { users, controller, tareas, res, next };
}

describe("PasswordResetController.forgotPassword", () => {
  it("responde 200 genérico ANTES de buscar al usuario: el trabajo queda en segundo plano", async () => {
    const m = crear();

    await m.controller.forgotPassword({ body: { email: "ana@x.com" } } as any, m.res as any, m.next);

    expect(m.res.status).toHaveBeenCalledWith(200);
    expect(m.res.json).toHaveBeenCalledWith({
      message: "Si el email está registrado, te enviamos un enlace para restablecer la contraseña.",
    });
    expect(m.users.findByEmailInsensitive).not.toHaveBeenCalled();
    expect(m.tareas).toHaveLength(1);

    await m.tareas[0]();
    expect(m.users.findByEmailInsensitive).toHaveBeenCalledWith("ana@x.com");
  });

  it("un fallo en segundo plano no se propaga y se loguea sin datos sensibles", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const falla = new PasswordResetController(
      {
        users: {
          findByEmailInsensitive: vi
            .fn()
            .mockRejectedValue(new Error("select * from Usuario where email='ana@x.com'")),
        },
      } as unknown as PasswordResetDeps,
    );
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await falla.forgotPassword({ body: { email: "ana@x.com" } } as any, res as any, vi.fn());
    await new Promise((r) => setImmediate(r));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("ana@x.com");
    errorSpy.mockRestore();
  });
});
