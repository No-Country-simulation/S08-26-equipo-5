import 'dotenv/config';

// * ==========================================
// * VALIDACIÓN ESTRICTA DE ENTORNO (FAIL-FAST)
// * ==========================================
// ! IMPORTANTE: Definimos las variables obligatorias que el servidor necesita sí o sí para arrancar.
const required = ['DATABASE_URL', 'NODE_ENV'] as const;

for(const key of required){
    if(!process.env[key]){
        // ! ERROR CRÍTICO: Si falta alguna variable, detenemos la ejecución de inmediato 
        // ! para evitar que la app arranque con un estado incompleto o inestable.
        throw new Error(`Falta la variable del entorno requerida: ${key}`);
    }
}

// * ==========================================
// * OBJETO DE CONFIGURACIÓN TIPADO Y SEGURO
// * ==========================================
// ? ¿Por qué se exporta esto? Centraliza y tipa todas las variables de entorno, 
// ? evitando usar process.env suelto por todo el código del backend.
export const env = {
    port: Number(process.env.PORT),
    databaseUrl: process.env.DATABASE_URL as string,
    nodeEnv: process.env.NODE_ENV ?? 'development'
} as const;