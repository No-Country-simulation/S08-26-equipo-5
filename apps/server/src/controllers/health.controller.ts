import type { Request, Response } from "express";

export class HealthController {
  public static check(_req: Request, res: Response): void {
    res.status(200).json({
      status: "success",
      message: "Backend operational & WebSockets ready",
      timestamp: new Date().toISOString(),
    });
  }
}
