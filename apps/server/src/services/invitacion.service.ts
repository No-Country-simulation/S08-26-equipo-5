import { EstadoParticipante } from "@prisma/client";
import { env } from "../config/env.js";
import type { MailPort } from "../mail/mail.port.js";
import { renderInvitacionEmail } from "../mail/templates/invitacion.template.js";
import type { IInvitacionRepository } from "../repositories/invitacion.repository.js";
import type { IParticipanteRepository } from "../repositories/participante.repository.js";
import type { ISalaRepository } from "../repositories/sala.repository.js";
import type { IUserRepository } from "../repositories/user.repository.js";
import type { RoomRole } from "../types/stream.js";
import { AppError } from "../utils/AppError.js";
import { signParticipantToken } from "../utils/participantToken.js";
import { emitJoinPending } from "./waitingRoom.service.js";
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

function armarMail(params: {
  to: string;
  salaNombre: string;
  hostNombre: string | null;
  token: string;
}) {
  return {
    to: params.to,
    ...renderInvitacionEmail({
      salaNombre: params.salaNombre,
      hostNombre: params.hostNombre,
      link: `${env.frontendUrl}/invitacion/${params.token}`,
      horas: env.invitacionTtlHoras,
    }),
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
  const hostNombre =
    [host.nombre, host.apellido].filter(Boolean).join(" ").trim() || null;

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
      message: armarMail({ to: email, salaNombre: sala.nombre, hostNombre, token }),
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

export interface AceptarInvitacionInput {
  token: string;
  /** `sub` del JWT de sesión, si el caller vino logueado. */
  usuarioId?: string | null;
  /** Payload crudo del body: solo se usa con invitados sin cuenta. */
  nombre?: unknown;
  apellido?: unknown;
}

/** Misma forma que la respuesta de POST /salas/:code/join (+ salaCodigo para la UI). */
export interface AceptarInvitacionResult {
  participanteId: string;
  estado: EstadoParticipante;
  salaId: string;
  salaCodigo: string;
  accessToken: string;
}

function textoNoVacio(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Acepta la invitación: INVITADO → PENDIENTE (el host lo aprueba como a
 * cualquier otro) y devuelve el guest JWT para suscribirse a la sala de espera.
 *
 * - Sin cuenta: nombre/apellido obligatorios; el email sale de la fila.
 * - Con cuenta: exige sesión de ESA cuenta; el body se ignora por completo.
 * - Consumo atómico (repositorio): solo una aceptación concurrente triunfa.
 * Toda causa de invalidez responde 410 INVITATION_INVALID.
 */
export async function aceptarInvitacion(
  deps: InvitacionDeps,
  input: AceptarInvitacionInput,
): Promise<AceptarInvitacionResult> {
  const invalida = () =>
    new AppError(410, "INVITATION_INVALID", "La invitación no es válida o ya venció");

  const invitacion = await deps.invitaciones.findByTokenHash(
    hashInvitationToken(input.token),
  );
  if (!invitacion) throw invalida();
  if (invitacion.usedAt || invitacion.expiresAt.getTime() <= Date.now()) throw invalida();

  const { participante } = invitacion;
  const { sala } = participante;
  if (participante.estado !== EstadoParticipante.INVITADO) throw invalida();
  if (sala.estado === "CANCELADA" || sala.estado === "FINALIZADA") throw invalida();

  let nombre: string | undefined;
  let apellido: string | undefined;

  if (participante.usuarioId) {
    if (!input.usuarioId) {
      throw new AppError(
        401,
        "LOGIN_REQUIRED",
        "Iniciá sesión con la cuenta invitada para aceptar",
      );
    }
    if (input.usuarioId !== participante.usuarioId) {
      throw new AppError(
        403,
        "INVITATION_ACCOUNT_MISMATCH",
        "La invitación pertenece a otra cuenta",
      );
    }
  } else {
    const n = textoNoVacio(input.nombre);
    const a = textoNoVacio(input.apellido);
    if (!n || !a) {
      throw validationError("Campos requeridos: nombre y apellido");
    }
    nombre = n;
    apellido = a;
  }

  const resultado = await deps.invitaciones.consumirYActivar({
    invitacionId: invitacion.id,
    participanteId: participante.id,
    ...(nombre !== undefined ? { nombre, apellido } : {}),
  });
  if (!resultado.invitacionConsumida || !resultado.participanteActivado) {
    throw invalida();
  }

  emitJoinPending(sala.id, {
    ...participante,
    estado: EstadoParticipante.PENDIENTE,
    nombre: nombre ?? participante.nombre,
    apellido: apellido ?? participante.apellido,
  });

  return {
    participanteId: participante.id,
    estado: EstadoParticipante.PENDIENTE,
    salaId: sala.id,
    salaCodigo: sala.codigo,
    accessToken: signParticipantToken({
      participanteId: participante.id,
      salaId: sala.id,
      rol: participante.rol as RoomRole,
    }),
  };
}
