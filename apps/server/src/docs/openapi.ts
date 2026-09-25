/**
 * Especificación OpenAPI 3.1 de la API de MeetFlow.
 *
 * IMPORTANTE: este documento describe los endpoints REALMENTE implementados
 * en `src/routes/*.ts` (no el contrato original de Hoppscotch, que incluía
 * algunos endpoints aún no desarrollados: ver sección "Pendientes" al final
 * de este archivo / respuesta del chat).
 */

const bearerAuth = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  },
} as const;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "S08-26-equipo-5 — API MeetFlow",
    description:
      "Documentación generada a partir del backend real (Express + Prisma). " +
      "Todas las rutas (salvo `/health` y `/webhooks/*`) están montadas bajo el prefijo `/api/v1`.",
    version: "1.0.1",
  },
  servers: [
    { url: "http://localhost:4000/api/v1", description: "Local" },
  ],
  tags: [
    { name: "Auth", description: "Registro, login y sesión" },
    { name: "Salas", description: "Gestión de salas (videollamadas)" },
    {
      name: "Agenda",
      description:
        "Listado de reuniones del usuario. Implementada como `GET /salas/mis-participaciones` " +
        "(el issue #33 la nombraba `GET /agenda`; se consolidó bajo este path en el PR #74).",
    },
    { name: "Health", description: "Estado del servicio" },
    { name: "Webhooks", description: "Eventos entrantes de GetStream" },
    { name: "Legacy", description: "Endpoints antiguos mantenidos por compatibilidad" },
  ],
  components: {
    securitySchemes: bearerAuth,
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "La solicitud contiene datos inválidos" },
              details: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    campo: { type: "string" },
                    mensaje: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      RegisterDto: {
        type: "object",
        required: ["nombre", "apellido", "email", "password"],
        properties: {
          nombre: { type: "string", example: "Jhon" },
          apellido: { type: "string", example: "Rivera" },
          email: { type: "string", format: "email", example: "jhon.rivera@example.com" },
          password: { type: "string", minLength: 8, example: "NubeAzul#4821" },
        },
      },
      RegisterResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Usuario registrado exitosamente" },
          userId: { type: "string", format: "uuid" },
        },
      },
      LoginDto: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "jhon.rivera@example.com" },
          password: { type: "string", example: "NubeAzul#4821" },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },
      RefreshDto: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" },
        },
      },
      LogoutResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Sesión cerrada exitosamente" },
        },
      },
      MeResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          nombre: { type: "string" },
          apellido: { type: "string" },
          email: { type: "string", format: "email" },
        },
      },
      CreateSalaBody: {
        type: "object",
        required: ["nombre"],
        properties: {
          nombre: { type: "string", maxLength: 150, example: "Daily Backend" },
          resumen: { type: "string", example: "Revisión del sprint y bloqueos" },
          fechaInicio: {
            type: "string",
            format: "date-time",
            example: "2026-09-15T18:00:00.000Z",
            description: "Opcional. Si se omite, la sala queda ACTIVA de inmediato.",
          },
        },
      },
      CreateSalaResponse: {
        type: "object",
        properties: {
          salaId: { type: "string", format: "uuid" },
          codigo: { type: "string", example: "ABCD1234" },
          nombre: { type: "string" },
          enlace: { type: "string", format: "uri" },
          streamRoomId: { type: "string" },
        },
      },
      SalaPublica: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          codigo: { type: "string" },
          nombre: { type: "string" },
          resumen: { type: "string", nullable: true },
          fechaInicio: { type: "string", format: "date-time" },
          estado: { $ref: "#/components/schemas/EstadoSala" },
          totalParticipantes: { type: "integer" },
        },
      },
      SalaResumen: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          codigo: { type: "string" },
          nombre: { type: "string" },
          resumen: { type: "string", nullable: true },
          fechaInicio: { type: "string", format: "date-time" },
          fechaFin: { type: "string", format: "date-time", nullable: true },
          estado: { $ref: "#/components/schemas/EstadoSala" },
          totalParticipantes: { type: "integer" },
          rol: { $ref: "#/components/schemas/RolParticipante" },
        },
      },
      MisParticipacionesResponse: {
        type: "object",
        properties: {
          salas: {
            type: "array",
            items: { $ref: "#/components/schemas/SalaResumen" },
          },
        },
      },
      ParticipanteInfo: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          nombre: { type: "string" },
          apellido: { type: "string" },
          email: { type: "string", format: "email" },
          rol: { $ref: "#/components/schemas/RolParticipante" },
          estado: { $ref: "#/components/schemas/EstadoParticipante" },
          fechaIngreso: { type: "string", format: "date-time", nullable: true },
        },
      },
      SalaDetalle: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          codigo: { type: "string" },
          nombre: { type: "string" },
          resumen: { type: "string", nullable: true },
          fechaInicio: { type: "string", format: "date-time" },
          fechaFin: { type: "string", format: "date-time", nullable: true },
          estado: { $ref: "#/components/schemas/EstadoSala" },
          streamRoomId: { type: "string", nullable: true },
          enlace: { type: "string", format: "uri" },
          totalParticipantes: { type: "integer" },
          participantes: {
            type: "array",
            items: { $ref: "#/components/schemas/ParticipanteInfo" },
          },
          creador: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              nombre: { type: "string" },
              apellido: { type: "string" },
              email: { type: "string", format: "email" },
            },
          },
        },
      },
      UpdateSalaBody: {
        type: "object",
        properties: {
          nombre: { type: "string", maxLength: 150 },
          resumen: { type: "string" },
          fechaInicio: { type: "string", format: "date-time" },
        },
      },
      UpdateSalaResponse: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          codigo: { type: "string" },
          nombre: { type: "string" },
          resumen: { type: "string", nullable: true },
          fechaInicio: { type: "string", format: "date-time" },
        },
      },
      ParticipantesResponse: {
        type: "object",
        properties: {
          salaId: { type: "string", format: "uuid" },
          salaNombre: { type: "string" },
          total: { type: "integer" },
          participantes: {
            type: "array",
            items: { $ref: "#/components/schemas/ParticipanteInfo" },
          },
        },
      },
      GenerateTokenBody: {
        type: "object",
        required: ["userId", "role"],
        properties: {
          userId: { type: "string" },
          role: { $ref: "#/components/schemas/RolParticipante" },
          callCid: { type: "string" },
        },
      },
      GenerateTokenResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "success" },
          message: { type: "string", example: "Backend operativo" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      EstadoSala: {
        type: "string",
        enum: ["PROGRAMADA", "ACTIVA", "FINALIZADA", "CANCELADA"],
      },
      EstadoParticipante: {
        type: "string",
        enum: ["PENDIENTE", "APROBADO", "RECHAZADO"],
      },
      RolParticipante: {
        type: "string",
        enum: ["HOST", "PARTICIPANTE"],
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Estado del servicio",
        operationId: "health_check",
        responses: {
          200: {
            description: "El servicio está operativo",
            content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
          },
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Registrar usuario",
        operationId: "auth_register",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterDto" } } },
        },
        responses: {
          201: {
            description: "Usuario creado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterResponse" } } },
          },
          400: { description: "Datos inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "El email ya está registrado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión",
        operationId: "auth_login",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginDto" } } },
        },
        responses: {
          200: {
            description: "Sesión iniciada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } },
          },
          401: { description: "Credenciales inválidas", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Obtener usuario autenticado",
        operationId: "auth_me",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Usuario actual",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MeResponse" } } },
          },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Cerrar sesión (revoca refresh token)",
        operationId: "auth_logout",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshDto" } } },
        },
        responses: {
          200: {
            description: "Sesión cerrada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LogoutResponse" } } },
          },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Renovar sesión",
        operationId: "auth_refresh",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RefreshDto" } } },
        },
        responses: {
          200: {
            description: "Tokens renovados",
            content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } },
          },
          401: { description: "Refresh token inválido o expirado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas": {
      post: {
        tags: ["Salas"],
        summary: "Crear sala",
        operationId: "salas_create",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSalaBody" },
              example: {
                nombre: "Daily Backend",
                resumen: "Revisión del sprint y bloqueos",
                fechaInicio: "2026-09-15T18:00:00.000Z",
              },
            },
          },
        },
        responses: {
          201: {
            description: "Sala creada",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateSalaResponse" },
                example: {
                  salaId: "a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d",
                  codigo: "ABCD1234",
                  nombre: "Daily Backend",
                  enlace: "http://localhost:3000/sala/ABCD1234",
                  streamRoomId: "default:a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d",
                },
              },
            },
          },
          400: { description: "Datos inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/mis-participaciones": {
      get: {
        tags: ["Agenda"],
        summary: "Agenda del usuario: salas donde participo (HOST o PARTICIPANTE)",
        description:
          "Endpoint de **Agenda** (issue #33 la referenciaba como `GET /agenda`). " +
          "Devuelve todas las salas donde el usuario autenticado participa, ordenadas por " +
          "`fechaInicio` descendente. El campo `rol` permite que el frontend distinga entre " +
          "reuniones creadas (`HOST`) y reuniones a las que fue invitado (`PARTICIPANTE`).",
        operationId: "salas_mis_participaciones",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Listado de salas (agenda del usuario)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MisParticipacionesResponse" },
                example: {
                  salas: [
                    {
                      id: "a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d",
                      codigo: "ABCD1234",
                      nombre: "Daily Backend",
                      resumen: "Revisión del sprint y bloqueos",
                      fechaInicio: "2026-09-15T18:00:00.000Z",
                      fechaFin: null,
                      estado: "PROGRAMADA",
                      totalParticipantes: 3,
                      rol: "HOST",
                    },
                  ],
                },
              },
            },
          },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{code}": {
      get: {
        tags: ["Salas"],
        summary: "Obtener sala por código público",
        operationId: "salas_get_by_code",
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, example: "ABCD1234" },
        ],
        responses: {
          200: {
            description: "Datos públicos de la sala",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SalaPublica" },
                example: {
                  id: "a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d",
                  codigo: "ABCD1234",
                  nombre: "Daily Backend",
                  resumen: "Revisión del sprint y bloqueos",
                  fechaInicio: "2026-09-15T18:00:00.000Z",
                  estado: "PROGRAMADA",
                  totalParticipantes: 3,
                },
              },
            },
          },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}/detalle": {
      get: {
        tags: ["Salas"],
        summary: "Obtener detalle de sala (con participantes)",
        operationId: "salas_get_detalle",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Detalle completo de la sala",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SalaDetalle" } } },
          },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}": {
      put: {
        tags: ["Salas"],
        summary: "Actualizar sala (solo HOST)",
        operationId: "salas_update",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateSalaBody" } } },
        },
        responses: {
          200: {
            description: "Sala actualizada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateSalaResponse" } } },
          },
          403: { description: "Solo el HOST puede actualizar la sala", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        tags: ["Salas"],
        summary: "Cancelar sala (solo HOST)",
        operationId: "salas_delete",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Sala cancelada",
            content: {
              "application/json": {
                schema: { type: "object", properties: { message: { type: "string", example: "Sala cancelada exitosamente" } } },
              },
            },
          },
          400: { description: "La sala ya está cancelada/finalizada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Solo el HOST puede cancelar la sala", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}/participantes": {
      get: {
        tags: ["Salas"],
        summary: "Listar participantes de una sala",
        operationId: "salas_get_participantes",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Listado de participantes",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ParticipantesResponse" } } },
          },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/rooms/{id}/token": {
      post: {
        tags: ["Legacy"],
        summary: "Generar token de GetStream (legacy)",
        operationId: "legacy_generate_token",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/GenerateTokenBody" } } },
        },
        responses: {
          200: {
            description: "Token generado",
            content: { "application/json": { schema: { $ref: "#/components/schemas/GenerateTokenResponse" } } },
          },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Sala no sincronizada con GetStream", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/webhooks/getstream": {
      // Override del servidor global: esta ruta se monta en app.ts SIN el
      // prefijo /api/v1, así que necesita su propia base para que "Try it out"
      // en Swagger UI le pegue a la URL correcta.
      servers: [{ url: "http://localhost:4000", description: "Local (sin prefijo /api/v1)" }],
      post: {
        tags: ["Webhooks"],
        summary: "Recibir eventos de GetStream (verificados por firma HMAC)",
        description:
          "⚠️ Ruta real: `POST /webhooks/getstream` (NO lleva el prefijo `/api/v1`). " +
          "No requiere JWT; se valida mediante la cabecera de firma HMAC de GetStream.",
        operationId: "webhooks_getstream",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "Evento procesado" },
          401: { description: "Firma inválida", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
  },
} as const;
