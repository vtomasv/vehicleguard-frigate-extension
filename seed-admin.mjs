/**
 * seed-admin.mjs — Creates the initial admin user for standalone Docker deployment.
 *
 * Usage (after docker compose up):
 *   docker compose exec app node seed-admin.mjs
 *
 * Or locally (with DATABASE_URL set):
 *   node seed-admin.mjs
 *
 * Environment variables:
 *   DATABASE_URL   — MySQL connection string (required)
 *   ADMIN_EMAIL    — Admin email (default: admin@vehicleguard.local)
 *   ADMIN_PASSWORD — Admin password (default: admin123)
 *   ADMIN_NAME     — Admin display name (default: Administrador)
 */

import "dotenv/config";
import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is required");
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@vehicleguard.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Administrador";

async function seed() {
  console.log("🌱 Iniciando seed del usuario administrador...");

  const conn = await createConnection(DATABASE_URL);

  try {
    // Check if user already exists
    const [rows] = await conn.execute(
      "SELECT id, email FROM users WHERE email = ? LIMIT 1",
      [ADMIN_EMAIL]
    );

    if (rows.length > 0) {
      console.log(`✅ El usuario admin ya existe: ${ADMIN_EMAIL}`);
      await conn.end();
      return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const openId = `local:admin-${Date.now()}`;

    await conn.execute(
      `INSERT INTO users (openId, email, name, passwordHash, loginMethod, role, createdAt, updatedAt, lastSignedIn)
       VALUES (?, ?, ?, ?, 'local', 'admin', NOW(), NOW(), NOW())`,
      [openId, ADMIN_EMAIL, ADMIN_NAME, passwordHash]
    );

    console.log(`✅ Usuario administrador creado exitosamente!`);
    console.log(`   Email:      ${ADMIN_EMAIL}`);
    console.log(`   Contraseña: ${ADMIN_PASSWORD}`);
    console.log(`   ⚠️  Cambia la contraseña después del primer inicio de sesión!`);
  } finally {
    await conn.end();
  }
}

seed().catch(err => {
  console.error("❌ Seed falló:", err.message);
  process.exit(1);
});
