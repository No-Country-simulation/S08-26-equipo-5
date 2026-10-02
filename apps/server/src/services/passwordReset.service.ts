import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import type { MailPort } from "../mail/mail.port.js";
import {
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
} from "../mail/templates/password-reset.template.js";
import type { IPasswordResetRepository } from "../repositories/passwordReset.repository.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import { AppError } from "../utils/AppError.js";
import { generateInvitationToken, hashInvitationToken } from "../utils/invitationToken.js";
import { maskEmail } from "../utils/maskEmail.js";

export interface PasswordResetDeps {
  users: IUserRepository;
  resets: IPasswordResetRepository;
  mailer: MailPort;
}

/** Respuesta fija de forgot-password: idéntica exista o no la cuenta. */
export const RESPUESTA_FORGOT = {
  message: "Si el email está registrado, te enviamos un enlace para restablecer la contraseña.",
} as const;

/** 32 bytes en base64url = 43 caracteres; el tope evita consultar la base con basura. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{16,128}$/;

const invalido = () =>
  new AppError(410, "RESET_TOKEN_INVALID", "El enlace no es válido o ya venció");

/**
 * Envío "fire and forget": no se espera al proveedor de correo y un fallo nunca
 * cambia la respuesta. El log lleva el destinatario enmascarado y solo el
 * nombre/código del error: el mensaje del proveedor puede traer el email
 * completo, la API key o el enlace con el token.
 */
function enviarEnSegundoPlano(
  mailer: MailPort,
  etiqueta: string,
  message: Parameters<MailPort["send"]>[0],
): void {
  void (async () => {
    try {
      await mailer.send(message);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      const motivo = [
        error instanceof Error ? error.name : "error desconocido",
        typeof code === "string" || typeof code === "number" ? String(code) : null,
      ]
        .filter(Boolean)
        .join(" ");
      console.error(
        `[password-reset] falló el envío (${etiqueta}) a ${maskEmail(message.to)}: ${motivo}`,
      );
    }
  })();
}

/**
 * Pedido de restablecimiento. Nunca revela si el email tiene cuenta: si no la
 * tiene, simplemente no hace nada. El controller responde siempre lo mismo.
 */
export async function solicitarReset(deps: PasswordResetDeps, email: string): Promise<void> {
  const usuario = await deps.users.findByEmailInsensitive(email.trim().toLowerCase());
  if (!usuario) return;

  const now = new Date();
  const token = generateInvitationToken();

  await deps.resets.crearReemplazando({
    usuarioId: usuario.id,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(now.getTime() + env.passwordResetTtlMinutes * 60 * 1000),
    now,
  });

  enviarEnSegundoPlano(deps.mailer, "enlace", {
    to: usuario.email,
    ...renderPasswordResetEmail({
      nombre: usuario.nombre,
      link: `${env.frontendUrl}/restablecer-contrasena/${token}`,
      minutos: env.passwordResetTtlMinutes,
    }),
  });
}

/**
 * Valida el token sin consumirlo. Desconocido, vencido o usado responden igual
 * (410 RESET_TOKEN_INVALID): no hay oráculo para quien prueba tokens.
 */
export async function validarToken(
  deps: PasswordResetDeps,
  token: string,
): Promise<{ valido: true; emailEnmascarado: string }> {
  if (!TOKEN_FORMAT.test(token)) throw invalido();

  const reset = await deps.resets.findValidoByTokenHash(hashInvitationToken(token), new Date());
  if (!reset) throw invalido();

  return { valido: true, emailEnmascarado: maskEmail(reset.email) };
}

/**
 * Cambia la contraseña con un token válido. El consumo es atómico: ante dos
 * usos concurrentes solo uno gana y el otro recibe 410. No inicia sesión.
 */
export async function restablecerPassword(
  deps: PasswordResetDeps,
  token: string,
  password: string,
): Promise<void> {
  if (!TOKEN_FORMAT.test(token)) throw invalido();
  const tokenHash = hashInvitationToken(token);

  // Chequeo barato antes del bcrypt: un token inválido no gasta CPU.
  const previo = await deps.resets.findValidoByTokenHash(tokenHash, new Date());
  if (!previo) throw invalido();

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  const usuario = await deps.resets.consumirYCambiarPassword({
    tokenHash,
    passwordHash,
    now: new Date(),
  });
  if (!usuario) throw invalido();

  enviarEnSegundoPlano(deps.mailer, "aviso de cambio", {
    to: usuario.email,
    ...renderPasswordChangedEmail({
      nombre: usuario.nombre,
      loginUrl: `${env.frontendUrl}/login`,
    }),
  });
}
