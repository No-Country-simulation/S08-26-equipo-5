import { PrismaClient, RolParticipante, EstadoParticipante, EstadoSala } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const SEED_PASSWORD = "password123";
const BCRYPT_SALT_ROUNDS = 10;

async function main() {
  console.log("🌱 Seeding database...");

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_SALT_ROUNDS);

  // ─── Usuarios ──────────────────────────────────────────
  const usuario1 = await prisma.usuario.create({
    data: {
      nombre: "Juan",
      apellido: "Pérez",
      email: "juan.perez@test.com",
      passwordHash,
    },
  });

  const usuario2 = await prisma.usuario.create({
    data: {
      nombre: "María",
      apellido: "García",
      email: "maria.garcia@test.com",
      passwordHash,
    },
  });

  const usuario3 = await prisma.usuario.create({
    data: {
      nombre: "Carlos",
      apellido: "López",
      email: "carlos.lopez@test.com",
      passwordHash,
    },
  });

  const usuario4 = await prisma.usuario.create({
    data: {
      nombre: "Ana",
      apellido: "Martínez",
      email: "ana.martinez@test.com",
      passwordHash,
    },
  });

  const usuario5 = await prisma.usuario.create({
    data: {
      nombre: "Pedro",
      apellido: "Rodríguez",
      email: "pedro.rodriguez@test.com",
      passwordHash,
    },
  });

  console.log(`  ✅ ${5} usuarios creados`);

  // ─── Salas ─────────────────────────────────────────────
  const sala1 = await prisma.sala.create({
    data: {
      codigo: "SALA-001",
      nombre: "Reunión de Planificación Sprint 1",
      resumen: "Planificación del primer sprint del proyecto MeetFlow",
      fechaInicio: new Date("2026-09-10T10:00:00Z"),
      fechaFin: new Date("2026-09-10T11:00:00Z"),
      estado: EstadoSala.PROGRAMADA,
    },
  });

  const sala2 = await prisma.sala.create({
    data: {
      codigo: "SALA-002",
      nombre: "Daily Standup",
      resumen: "Reunión diaria de seguimiento del equipo",
      fechaInicio: new Date("2026-09-08T09:00:00Z"),
      estado: EstadoSala.ACTIVA,
    },
  });

  const sala3 = await prisma.sala.create({
    data: {
      codigo: "SALA-003",
      nombre: "Demo Final",
      resumen: "Presentación del producto final al cliente",
      fechaInicio: new Date("2026-09-05T15:00:00Z"),
      fechaFin: new Date("2026-09-05T16:00:00Z"),
      estado: EstadoSala.FINALIZADA,
    },
  });

  console.log(`  ✅ ${3} salas creadas`);

  // ─── Participantes ─────────────────────────────────────
  await prisma.participante.createMany({
    data: [
      // Sala 1 - Planificación
      {
        salaId: sala1.id,
        usuarioId: usuario1.id,
        nombre: usuario1.nombre,
        apellido: usuario1.apellido,
        email: usuario1.email,
        rol: RolParticipante.HOST,
        estado: EstadoParticipante.APROBADO,
      },
      {
        salaId: sala1.id,
        usuarioId: usuario2.id,
        nombre: usuario2.nombre,
        apellido: usuario2.apellido,
        email: usuario2.email,
        rol: RolParticipante.PARTICIPANTE,
        estado: EstadoParticipante.APROBADO,
      },
      {
        salaId: sala1.id,
        usuarioId: usuario3.id,
        nombre: usuario3.nombre,
        apellido: usuario3.apellido,
        email: usuario3.email,
        rol: RolParticipante.PARTICIPANTE,
        estado: EstadoParticipante.PENDIENTE,
      },
      // Sala 2 - Daily
      {
        salaId: sala2.id,
        usuarioId: usuario1.id,
        nombre: usuario1.nombre,
        apellido: usuario1.apellido,
        email: usuario1.email,
        rol: RolParticipante.HOST,
        estado: EstadoParticipante.APROBADO,
        fechaIngreso: new Date("2026-09-08T09:00:00Z"),
      },
      {
        salaId: sala2.id,
        usuarioId: usuario4.id,
        nombre: usuario4.nombre,
        apellido: usuario4.apellido,
        email: usuario4.email,
        rol: RolParticipante.PARTICIPANTE,
        estado: EstadoParticipante.APROBADO,
        fechaIngreso: new Date("2026-09-08T09:01:00Z"),
      },
      {
        salaId: sala2.id,
        usuarioId: usuario5.id,
        nombre: usuario5.nombre,
        apellido: usuario5.apellido,
        email: usuario5.email,
        rol: RolParticipante.PARTICIPANTE,
        estado: EstadoParticipante.RECHAZADO,
      },
      // Sala 3 - Demo Final (ya finalizada)
      {
        salaId: sala3.id,
        usuarioId: usuario1.id,
        nombre: usuario1.nombre,
        apellido: usuario1.apellido,
        email: usuario1.email,
        rol: RolParticipante.HOST,
        estado: EstadoParticipante.APROBADO,
        fechaIngreso: new Date("2026-09-05T15:00:00Z"),
        fechaSalida: new Date("2026-09-05T16:00:00Z"),
      },
      {
        salaId: sala3.id,
        usuarioId: usuario2.id,
        nombre: usuario2.nombre,
        apellido: usuario2.apellido,
        email: usuario2.email,
        rol: RolParticipante.PARTICIPANTE,
        estado: EstadoParticipante.APROBADO,
        fechaIngreso: new Date("2026-09-05T15:02:00Z"),
        fechaSalida: new Date("2026-09-05T15:58:00Z"),
      },
    ],
  });

  console.log(`  ✅ ${8} participantes creados`);

  // ─── Resumen ───────────────────────────────────────────
  const totalUsuarios = await prisma.usuario.count();
  const totalSalas = await prisma.sala.count();
  const totalParticipantes = await prisma.participante.count();

  console.log("\n📊 Resumen del seed:");
  console.log(`   Usuarios:      ${totalUsuarios}`);
  console.log(`   Salas:         ${totalSalas}`);
  console.log(`   Participantes: ${totalParticipantes}`);
  console.log("\n✨ Seed completado exitosamente!");
}

main()
  .catch((e) => {
    console.error("❌ Error durante el seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
