import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();

// * Definimos la ruta GET /health dentro del prefijo de la API v1
router.get('/health', HealthController.check);

export const healthRoutes = router;