import { Request, Response, NextFunction } from "express";

// * ==========================================
// * CLASE DE ERROR OPERACIONAL PERSONALIZADO
// * ==========================================
export class AppError extends Error {
    constructor(
        public statusCode: number, // ! IMPORTANTE: Define el código HTTP de respuesta (ej: 400, 404, 401)
        public code: string,       // * IDENTIFICADOR: Código en texto plano para que el Frontend sepa qué falló (ej: 'ROOM_NOT_FOUND')
        message: string,           // Mensaje descriptivo legible para el usuario
    ) {
        super(message);
        this.name = "AppError";
    }
}

// * ==========================================
// * MIDDLEWARE GLOBAL DE MANEJO DE ERRORES
// * ==========================================
// ? ¿Cómo funciona? Express intercepta automáticamente cualquier error pasado por 'next(err)' o lanzado en la app.
export function errorMiddleware(
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
) {
    // * CASO 1: Error controlado u operacional (Lanzado intencionalmente con AppError)
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            error: { code: err.code, message: err.message },
        });
    }

    // ! ALERTA: Error no controlado (Bug de código, caída de la BD, fallo imprevisto)
    console.error("[UnhandledError]", err);

    // TODO: En fases avanzadas del MVP, integrar un servicio de monitoreo externo (ej: Sentry) aquí.
    return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Error interno del servidor." },
    });
}