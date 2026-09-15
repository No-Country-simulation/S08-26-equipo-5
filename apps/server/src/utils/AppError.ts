export interface AppErrorDetail {
  campo: string;
  mensaje: string;
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: AppErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
