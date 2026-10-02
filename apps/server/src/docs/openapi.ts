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
    { name: "Usuarios", description: "Perfil del usuario (foto)" },
    { name: "Salas", description: "Gestión de salas (videollamadas)" },
    {
      name: "Agenda",
      description:
        "Listado de reuniones del usuario. Implementada como `GET /salas/mis-participaciones` " +
        "(el issue #33 la nombraba `GET /agenda`; se consolidó bajo este path en el PR #74).",
    },
    {
      name: "Invitaciones",
      description:
        "Invitación por correo a una sala. El host invita a 1..20 emails; cada invitado recibe un " +
        "enlace personal con un token opaco (solo viaja por correo: la API nunca lo devuelve y en " +
        "base de datos solo se guarda su hash SHA-256). Vigencia configurable (`INVITACION_TTL_HORAS`, " +
        "72 h por defecto).",
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
      ForgotPasswordDto: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", example: "jhon.rivera@example.com" },
        },
      },
      MessageResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Contraseña actualizada" },
        },
      },
      ResetPasswordDto: {
        type: "object",
        required: ["password"],
        properties: {
          password: { type: "string", minLength: 8, example: "NubeAzul#4821" },
        },
      },
      ResetTokenValidationResponse: {
        type: "object",
        properties: {
          valido: { type: "boolean", example: true },
          emailEnmascarado: { type: "string", example: "j***@example.com" },
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
          fotoUrl: { type: "string", format: "uri", nullable: true, description: "Foto de perfil (null si no subió ninguna)" },
        },
      },
      FotoPerfilBody: {
        type: "object",
        required: ["foto"],
        properties: {
          foto: { type: "string", format: "binary", description: "JPEG, PNG o WebP. Máx. `AVATAR_MAX_BYTES` (2 MB por defecto). El tipo se valida por contenido, no por extensión." },
        },
      },
      FotoPerfilResponse: {
        type: "object",
        properties: {
          fotoUrl: { type: "string", format: "uri", example: "https://res.cloudinary.com/demo/image/upload/v1759230000/meetflow/avatars/uuid.jpg" },
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
          nombre: { type: "string", nullable: true, description: "null mientras el participante está INVITADO sin cuenta" },
          apellido: { type: "string", nullable: true, description: "null mientras el participante está INVITADO sin cuenta" },
          email: { type: "string", format: "email", nullable: true, description: "null para quien no es HOST (solo el HOST ve los emails)" },
          rol: { $ref: "#/components/schemas/RolParticipante" },
          estado: { $ref: "#/components/schemas/EstadoParticipante" },
          fechaIngreso: { type: "string", format: "date-time", nullable: true },
          fotoUrl: { type: "string", format: "uri", nullable: true, description: "Foto de la cuenta vinculada; null para invitados o sin foto" },
        },
      },
      InvitarBody: {
        type: "object",
        required: ["emails"],
        properties: {
          emails: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string", format: "email" },
            description: "Se normalizan (trim + minúsculas) y se deduplican dentro del request.",
            example: ["ana@example.com", "luis@example.com"],
          },
        },
      },
      ResultadoInvitacion: {
        type: "object",
        properties: {
          email: { type: "string", format: "email" },
          estado: {
            type: "string",
            enum: ["INVITADO", "REENVIADO", "YA_PARTICIPA"],
            description:
              "INVITADO: invitación nueva. REENVIADO: ya estaba invitado; se rotó el token (el enlace anterior deja de valer). " +
              "YA_PARTICIPA: ya es participante de la sala (no se crea ni envía nada). " +
              "Ningún campo revela si el email tiene cuenta.",
          },
          emailEnviado: {
            type: "boolean",
            description: "false si el envío falló: la invitación queda creada y se puede reinvitar.",
          },
        },
      },
      InvitarResponse: {
        type: "object",
        properties: {
          resultados: { type: "array", items: { $ref: "#/components/schemas/ResultadoInvitacion" } },
        },
      },
      PreviewInvitacionResponse: {
        type: "object",
        properties: {
          sala: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
              nombre: { type: "string" },
            },
          },
          email: {
            type: "string",
            description:
              "Email enmascarado (endpoint público): primera letra + `***` + dominio completo. Ej.: `a***@example.com`. Nunca el email completo.",
            example: "a***@example.com",
          },
          requiereDatos: { type: "boolean", description: "true si el invitado no tiene cuenta (deberá completar nombre y apellido)" },
          requiereLogin: { type: "boolean", description: "true si el invitado tiene cuenta (deberá iniciar sesión)" },
        },
      },
      AceptarInvitacionBody: {
        type: "object",
        description:
          "Solo para invitados sin cuenta. Con cuenta registrada se ignora (los datos salen de la cuenta). " +
          "Cualquier `email` enviado se ignora: vale el de la invitación.",
        properties: {
          nombre: { type: "string" },
          apellido: { type: "string" },
        },
      },
      AceptarInvitacionResponse: {
        type: "object",
        description: "Misma forma que POST /salas/{code}/join, más salaCodigo.",
        properties: {
          participanteId: { type: "string", format: "uuid" },
          estado: { type: "string", enum: ["PENDIENTE"] },
          salaId: { type: "string", format: "uuid" },
          salaCodigo: { type: "string" },
          accessToken: { type: "string", description: "Guest JWT para autenticar el socket y consultar mi-estado" },
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
              email: { type: "string", format: "email", nullable: true, description: "null para quien no es HOST" },
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
      TransferHostBody: {
        type: "object",
        required: ["nuevoHostId"],
        properties: {
          nuevoHostId: {
            type: "string",
            format: "uuid",
            description:
              "Participante.id (NO usuarioId) del participante que va a pasar a HOST. " +
              "Coincide con el userId que usa GetStream para identificar participantes " +
              "en la llamada. El target debe ser participante de la sala Y tener cuenta " +
              "registrada (usuarioId != null) — participantes invitados no pueden ser HOST.",
          },
        },
      },
      TransferHostResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Rol de HOST transferido exitosamente" },
          host: { type: "object", properties: { usuarioId: { type: "string", format: "uuid" } } },
          previousHost: { type: "object", properties: { usuarioId: { type: "string", format: "uuid" } } },
        },
      },
      FinalizarSalaResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "Sala finalizada exitosamente" },
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
        enum: ["INVITADO", "PENDIENTE", "APROBADO", "RECHAZADO"],
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
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Pedir enlace para restablecer la contraseña",
        description:
          "Responde **siempre** 200 con el mismo mensaje, exista o no la cuenta (sin enumeración de usuarios). " +
          "Si la cuenta existe, invalida los pedidos previos pendientes y envía por correo un enlace " +
          "`FRONTEND_URL/restablecer-contrasena/<token>` de un solo uso que vence en " +
          "`PASSWORD_RESET_TTL_MINUTES` (30). Un fallo del proveedor de correo no cambia la respuesta. " +
          "Rate limit: `RATE_LIMIT_FORGOT_MAX` (5) cada 15 min por IP y por email (429 `RATE_LIMITED`).",
        operationId: "auth_forgot_password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ForgotPasswordDto" } } },
        },
        responses: {
          200: {
            description: "Mensaje genérico",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
                example: { message: "Si el email está registrado, te enviamos un enlace para restablecer la contraseña." },
              },
            },
          },
          400: { description: "`VALIDATION_ERROR`: email faltante o con formato inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "`RATE_LIMITED`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/reset-password/{token}": {
      get: {
        tags: ["Auth"],
        summary: "Validar el token de restablecimiento",
        description:
          "Público, no consume el token. Token desconocido, vencido o ya usado responden igual " +
          "(410 `RESET_TOKEN_INVALID`): no hay oráculo para quien prueba tokens. " +
          "Rate limit por IP: `RATE_LIMIT_TOKEN_MAX` (30) cada 15 min.",
        operationId: "auth_reset_password_validate",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Token válido",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ResetTokenValidationResponse" } } },
          },
          410: { description: "`RESET_TOKEN_INVALID`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "`RATE_LIMITED`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Restablecer la contraseña con el token",
        description:
          "Mismas reglas de contraseña que el registro (mínimo 8). El token se consume de forma atómica " +
          "(un solo uso: ante dos pedidos concurrentes uno recibe 410), se actualiza el hash y se revocan " +
          "**todos** los refresh tokens del usuario en una sola transacción. No inicia sesión: el cliente " +
          "debe hacer login. Se envía un correo de aviso (best-effort). Rate limit por IP: `RATE_LIMIT_TOKEN_MAX`.",
        operationId: "auth_reset_password",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/ResetPasswordDto" } } },
        },
        responses: {
          200: {
            description: "Contraseña actualizada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MessageResponse" } } },
          },
          400: { description: "`VALIDATION_ERROR`: contraseña faltante o de menos de 8 caracteres", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          410: { description: "`RESET_TOKEN_INVALID`: desconocido, vencido o ya usado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "`RATE_LIMITED`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/usuarios/me/foto": {
      put: {
        tags: ["Usuarios"],
        summary: "Subir o reemplazar la foto de perfil",
        description:
          "`multipart/form-data` con el campo `foto`. La imagen se valida por magic bytes " +
          "(JPEG/PNG/WebP), se recorta a 256x256 centrada en la cara y se guarda en Cloudinary. " +
          "Sin `CLOUDINARY_URL` responde 503 `UPLOADS_NOT_CONFIGURED`. Rate limit: " +
          "`RATE_LIMIT_AVATAR_MAX` (10) cada 15 min por usuario. Cada subida usa un id opaco en Cloudinary; " +
          "el avatar en GetStream se actualiza en el próximo `stream-token`.",
        operationId: "usuarios_put_foto",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/FotoPerfilBody" } } },
        },
        responses: {
          200: {
            description: "Foto actualizada",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FotoPerfilResponse" } } },
          },
          400: { description: "`VALIDATION_ERROR`: falta la imagen (campo `foto`) o el multipart está mal formado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "`PHOTO_UPDATE_CONFLICT`: otro PUT del mismo usuario cambió la foto en paralelo; el asset recién subido se descarta. Reintentar", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          413: { description: "`FILE_TOO_LARGE`: supera `AVATAR_MAX_BYTES`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          415: { description: "`UNSUPPORTED_MEDIA_TYPE`: no es JPEG/PNG/WebP", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "`RATE_LIMITED`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          502: { description: "`UPLOAD_FAILED`: falló Cloudinary", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          503: { description: "`UPLOADS_NOT_CONFIGURED`: sin `CLOUDINARY_URL`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        tags: ["Usuarios"],
        summary: "Quitar la foto de perfil",
        description: "Idempotente: 204 aunque no hubiera foto. Funciona también sin `CLOUDINARY_URL` (limpia la base y omite el borrado remoto). Si falla el borrado en Cloudinary igual se limpia la base (se loguea un warning).",
        operationId: "usuarios_delete_foto",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: "Foto eliminada" },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "`RATE_LIMITED`", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
        description:
          "Visibilidad: solo participa quien es HOST o un participante no INVITADO vinculado a su cuenta (si no, 403 `NOT_A_PARTICIPANT`). Solo el HOST ve las filas `INVITADO` y los emails; para el resto se omiten los INVITADO y `email` viene en `null`.",
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
          403: { description: "La cuenta no es participante de la sala (NOT_A_PARTICIPANT)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
    "/salas/{id}/invitaciones": {
      post: {
        tags: ["Invitaciones"],
        summary: "Invitar por correo a una sala (solo HOST)",
        description:
          "Crea (o reenvía) una invitación por email. Los correos se envían después de persistir; " +
          "si el envío falla no se revierte nada (`emailEnviado: false`). Rate limit por host: " +
          "`RATE_LIMIT_INVITE_MAX` cada 15 min (429 `RATE_LIMITED`).",
        operationId: "invitaciones_invitar",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/InvitarBody" } } },
        },
        responses: {
          200: {
            description: "Resultado por email",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InvitarResponse" },
                example: {
                  resultados: [
                    { email: "ana@example.com", estado: "INVITADO", emailEnviado: true },
                    { email: "luis@example.com", estado: "YA_PARTICIPA", emailEnviado: false },
                  ],
                },
              },
            },
          },
          400: { description: "`emails` vacío, con más de 20 elementos o con formato inválido (VALIDATION_ERROR)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Sin JWT", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Solo el HOST puede invitar (HOST_ONLY)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada (ROOM_NOT_FOUND)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Sala cancelada o finalizada (ROOM_CANCELLED / ROOM_FINISHED)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "Rate limit excedido (RATE_LIMITED)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/invitaciones/{token}": {
      get: {
        tags: ["Invitaciones"],
        summary: "Vista previa de una invitación (público, no consume el token)",
        description:
          "Permite a la UI decidir si pedir nombre/apellido (`requiereDatos`) o inicio de sesión " +
          "(`requiereLogin`). Token desconocido, vencido, ya usado o de una sala cerrada responden " +
          "todos igual (410 `INVITATION_INVALID`) para no dar pistas a quien prueba tokens. " +
          "Rate limit por IP: `RATE_LIMIT_TOKEN_MAX` cada 15 min.",
        operationId: "invitaciones_preview",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Invitación válida",
            content: { "application/json": { schema: { $ref: "#/components/schemas/PreviewInvitacionResponse" } } },
          },
          410: { description: "Invitación inválida (INVITATION_INVALID)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "Rate limit excedido (RATE_LIMITED)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/invitaciones/{token}/aceptar": {
      post: {
        tags: ["Invitaciones"],
        summary: "Aceptar una invitación (INVITADO → PENDIENTE)",
        description:
          "Sesión opcional (Bearer): obligatoria solo si la invitación es de una cuenta registrada. " +
          "Si la invitación es de un email sin cuenta pero vino sesión, el email de la cuenta debe coincidir " +
          "(case-insensitive) con el invitado: se vincula la fila a la cuenta; si no, 403 `INVITATION_ACCOUNT_MISMATCH` " +
          "sin consumir el token. " +
          "Consumo atómico de un solo uso; avisa al host por `join:pending`. " +
          "Todo token inválido/vencido/usado/carrera responde 410 `INVITATION_INVALID`. " +
          "Rate limit por IP: `RATE_LIMIT_TOKEN_MAX` cada 15 min.",
        operationId: "invitaciones_aceptar",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { $ref: "#/components/schemas/AceptarInvitacionBody" } } },
        },
        responses: {
          200: {
            description: "Invitación aceptada: el participante queda PENDIENTE",
            content: { "application/json": { schema: { $ref: "#/components/schemas/AceptarInvitacionResponse" } } },
          },
          400: { description: "Falta nombre/apellido (VALIDATION_ERROR); el token no se consume", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Invitación de cuenta registrada sin sesión (LOGIN_REQUIRED)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "La sesión es de otra cuenta, o el email de la cuenta no coincide con el invitado (INVITATION_ACCOUNT_MISMATCH); el token no se consume", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "La cuenta logueada ya es otro participante de la sala (ALREADY_PARTICIPANT); el token no se consume", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          410: { description: "Invitación inválida (INVITATION_INVALID)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          429: { description: "Rate limit excedido (RATE_LIMITED)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}/participantes": {
      get: {
        tags: ["Salas"],
        summary: "Listar participantes de una sala",
        description:
          "Visibilidad: solo participa quien es HOST o un participante no INVITADO vinculado a su cuenta (si no, 403 `NOT_A_PARTICIPANT`). Solo el HOST ve las filas `INVITADO` y los emails; para el resto se omiten los INVITADO y `email` viene en `null`.",
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
          403: { description: "La cuenta no es participante de la sala (NOT_A_PARTICIPANT)", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}/transfer-host": {
      post: {
        tags: ["Salas"],
        summary: "Transferir el rol HOST a otro participante (S3-08)",
        description:
          "Solo el HOST actual puede transferir. El caller queda `PARTICIPANTE` y el " +
          "target pasa a `HOST` (se preserva el `estado` de ambos). Transacción con " +
          "guard anti-TOCTOU (`updateMany` condicional): dos transfers concurrentes " +
          "solo dejan ganar a uno. El target debe tener cuenta registrada (participante " +
          "invitado sin `usuarioId` no califica). Sincroniza los roles en GetStream " +
          "(server-side, vía API secret) para que el nuevo host pueda finalizar/expulsar " +
          "en la llamada real, no solo en la DB.",
        operationId: "salas_transfer_host",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TransferHostBody" } } },
        },
        responses: {
          200: {
            description: "Rol transferido",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TransferHostResponse" } } },
          },
          400: { description: "`nuevoHostId` ausente o auto-transferencia", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Solo el HOST puede transferir el rol", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada / el nuevo host no es participante de la sala o no tiene cuenta registrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/salas/{id}/finalizar": {
      post: {
        tags: ["Salas"],
        summary: "Finalizar sala explícitamente (solo HOST)",
        description:
          "Cambia el estado de la sala a `FINALIZADA` y emite `room:ended` por el " +
          "namespace `/reuniones` para que los clientes conectados sean redirigidos, " +
          "sin esperar el webhook de GetStream. Pensado como fallback explícito para " +
          "cuando el webhook no llega (ej. desarrollo local sin URL pública). " +
          "Idempotente: si la sala ya estaba `FINALIZADA`, responde 200 igual.",
        operationId: "salas_finalizar",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          200: {
            description: "Sala finalizada (o ya lo estaba)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/FinalizarSalaResponse" } } },
          },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Solo el HOST puede finalizar la sala", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          404: { description: "Sala no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/rooms/{salaId}/token": {
      post: {
        tags: ["Salas"],
        deprecated: true,
        summary: "[DEPRECATED] Alias legacy de POST /salas/{salaId}/stream-token",
        description:
          "Mantenido solo por compatibilidad con clientes viejos (apps/web sigue " +
          "llamando a este path). Delega en la misma lógica segura que " +
          "/salas/{salaId}/stream-token vía el middleware `authParticipante`: el " +
          "rol y el usuario siempre salen de la DB/JWT, cualquier campo del body " +
          "(userId, role, callCid) se ignora. Usar el endpoint nuevo en " +
          "integraciones nuevas. El param de ruta se llama `salaId` (no `id`) a " +
          "propósito, porque `authParticipante` lee `req.params.salaId`.",
        operationId: "rooms_generate_token_legacy",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "salaId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", description: "Se acepta cualquier body por compatibilidad; el contenido se ignora." },
            },
          },
        },
        responses: {
          200: {
            description: "Token de GetStream",
            content: {
              "application/json": {
                schema: { type: "object" },
                example: {
                  apiKey: "gs-api-key",
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  userId: "a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d",
                  user: { id: "a3b1c2d4-5e6f-4a1b-8c9d-0e1f2a3b4c5d", name: "Ana Pérez" },
                  rol: "HOST",
                  callType: "default",
                  callId: "abc-123",
                  callCid: "default:abc-123",
                  sala: { id: "sala-id", codigo: "ABCD1234", nombre: "Daily Backend", estado: "ACTIVA" },
                  expiresAt: "2026-09-25T19:00:00.000Z",
                },
              },
            },
          },
          401: { description: "No autenticado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "No sos participante de la sala, o no estás aprobado", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          409: { description: "Sala cancelada, finalizada o no sincronizada con GetStream", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
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
