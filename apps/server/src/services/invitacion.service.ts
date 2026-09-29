import { EstadoParticipante } from "@prisma/client";
import { env } from "../config/env.js";
import type { MailPort } from "../mail/mail.port.js";
import type { IInvitacionRepository } from "../repositories/invitacion.repository.js";
import type { IParticipanteRepository } from "../repositories/participante.repository.js";
import type { ISalaRepository } from "../repositories/sala.repository.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import { AppError } from "../utils/AppError.js";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../utils/invitationToken.js";

/** Tope de emails por request (mitiga abuso del envío de correo). */
export const MAX_INVITES = 20;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface InvitacionDeps {
  participantes: IParticipanteRepository;
  invitaciones: IInvitacionRepository;
  salas: ISalaRepository;
  usuarios: IUserRepository;
  mailer: MailPort;
}

export type EstadoInvitacionResultado = "INVITADO" | "REENVIADO" | "YA_PARTICIPA";

/**
 * Resultado por email. No incluye ningún dato que delate si el email tiene
 * cuenta: la forma es idéntica para registrados y no registrados.
 */
export interface ResultadoInvitacion {
  email: string;
  estado: EstadoInvitacionResultado;
  emailEnviado: boolean;
}

export interface InvitarInput {
  salaId: string;
  hostUserId: string;
  /** Payload crudo del body: se valida acá. */
  emails: unknown;
}

export interface PreviewInvitacionResult {
  sala: { id: string; nombre: string };
  email: string;
  requiereDatos: boolean;
  requiereLogin: boolean;
}

function validationError(message: string): AppError {
  return new AppError(400, "VALIDATION_ERROR", message);
}

/** trim + lowercase + dedupe; 400 si el payload no es válido. */
function normalizarEmails(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw validationError("Se requiere al menos un email");
  }
  if (raw.length > MAX_INVITES) {
    throw validationError(`Máximo ${MAX_INVITES} emails por solicitud`);
  }

  const emails = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") {
      throw validationError("Los emails deben ser texto");
    }
    const email = item.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw validationError("Uno o más emails no son válidos");
    }
    emails.add(email);
  }
  return [...emails];
}

function armarMail(params: { to: string; salaNombre: string; token: string }) {
  const link = `${env.frontendUrl}/invitacion/${params.token}`;
  const horas = env.invitacionTtlHoras;
  return {
    to: params.to,
    subject: `Te invitaron a la sala "${params.salaNombre}"`,
    text:
      `Te invitaron a unirte a la sala "${params.salaNombre}" en MeetFlow.\n\n` +
      `Ingresá desde este enlace: ${link}\n\n` +
      `El enlace es personal y vence en ${horas} horas.`,
  };
}

interface EnvioPendiente {
  indice: number;
  message: ReturnType<typeof armarMail>;
}

/**
 * Invita por correo a 1..MAX_INVITES emails. Solo el HOST de la sala puede.
 *
 * Orden: primero se persisten TODAS las filas y recién después se envían los
 * correos (Promise.allSettled). Un fallo de envío no revierte nada: se
 * reporta `emailEnviado: false` y el host puede reinvitar (rota el token).
 */
export async function invitar(
  deps: InvitacionDeps,
  input: InvitarInput,
): Promise<{ resultados: ResultadoInvitacion[] }> {
  const sala = await deps.salas.findById(input.salaId);
  if (!sala) {
    throw new AppError(404, "ROOM_NOT_FOUND", "Sala no encontrada");
  }

  const host = await deps.participantes.findHost(input.salaId, input.hostUserId);
  if (!host) {
    throw new AppError(403, "HOST_ONLY", "Solo el HOST puede invitar a la sala");
  }

  if (sala.estado === "CANCELADA") {
    throw new AppError(409, "ROOM_CANCELLED", "La sala fue cancelada");
  }
  if (sala.estado === "FINALIZADA") {
    throw new AppError(409, "ROOM_FINISHED", "La reunión ya finalizó");
  }

  const emails = normalizarEmails(input.emails);

  const expiresAt = () => new Date(Date.now() + env.invitacionTtlHoras * 3600 * 1000);
  const resultados: ResultadoInvitacion[] = [];
  const envios: EnvioPendiente[] = [];

  // Secuencial a propósito: evita carreras entre emails de un mismo request
  // y mantiene el orden de los resultados.
  for (const email of emails) {
    const existente = await deps.participantes.findByEmail(input.salaId, email);

    if (existente && existente.estado !== EstadoParticipante.INVITADO) {
      resultados.push({ email, estado: "YA_PARTICIPA", emailEnviado: false });
      continue;
    }

    const token = generateInvitationToken();
    const tokenHash = hashInvitationToken(token);

    if (existente) {
      await deps.invitaciones.rotarToken({
        participanteId: existente.id,
        tokenHash,
        expiresAt: expiresAt(),
        invitadoPorId: input.hostUserId,
      });
      resultados.push({ email, estado: "REENVIADO", emailEnviado: false });
    } else {
      const usuario = await deps.usuarios.findByEmailInsensitive(email);

      // La cuenta ya es participante con otro email (típico: el propio host).
      if (usuario && (await deps.participantes.findByUsuario(input.salaId, usuario.id))) {
        resultados.push({ email, estado: "YA_PARTICIPA", emailEnviado: false });
        continue;
      }

      await deps.invitaciones.crearInvitado({
        salaId: input.salaId,
        email,
        usuarioId: usuario?.id ?? null,
        nombre: usuario?.nombre ?? null,
        apellido: usuario?.apellido ?? null,
        tokenHash,
        expiresAt: expiresAt(),
        invitadoPorId: input.hostUserId,
      });
      resultados.push({ email, estado: "INVITADO", emailEnviado: false });
    }

    envios.push({
      indice: resultados.length - 1,
      message: armarMail({ to: email, salaNombre: sala.nombre, token }),
    });
  }

  const enviados = await Promise.allSettled(
    envios.map((e) => deps.mailer.send(e.message)),
  );
  enviados.forEach((r, i) => {
    const { indice } = envios[i];
    if (r.status === "fulfilled") {
      resultados[indice].emailEnviado = true;
    } else {
      // Sin token ni enlace en el log: solo el destinatario y el motivo.
      const motivo = r.reason instanceof Error ? r.reason.message : "error desconocido";
      console.error(`[invitaciones] falló el envío a ${resultados[indice].email}: ${motivo}`);
    }
  });

  return { resultados };
}

/**
 * Vista previa del token (público, no lo consume). Cualquier causa de
 * invalidez responde igual (410 INVITATION_INVALID): no hay oráculo que
 * distinga token inexistente, vencido, usado o de una sala cerrada.
 */
export async function previewInvitacion(
  deps: InvitacionDeps,
  token: string,
): Promise<PreviewInvitacionResult> {
  const invitacion = await deps.invitaciones.findByTokenHash(hashInvitationToken(token));

  const invalida = () =>
    new AppError(410, "INVITATION_INVALID", "La invitación no es válida o ya venció");

  if (!invitacion) throw invalida();
  if (invitacion.usedAt || invitacion.expiresAt.getTime() <= Date.now()) throw invalida();

  const { participante } = invitacion;
  if (participante.estado !== EstadoParticipante.INVITADO) throw invalida();
  if (participante.sala.estado === "CANCELADA" || participante.sala.estado === "FINALIZADA") {
    throw invalida();
  }

  return {
    sala: { id: participante.sala.id, nombre: participante.sala.nombre },
    email: participante.email,
    requiereDatos: participante.usuarioId === null,
    requiereLogin: participante.usuarioId !== null,
  };
}
