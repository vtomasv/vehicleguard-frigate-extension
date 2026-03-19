/**
 * migrate.mjs — Run Drizzle ORM migrations at container startup
 *
 * Uses drizzle-orm/migrator directly (production dependency).
 * Does NOT require drizzle-kit (dev dependency).
 *
 * Usage: node migrate.mjs
 */

import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is required");
  process.exit(1);
}

console.log("Running database migrations...");

let connection;
try {
  connection = await mysql.createConnection(DATABASE_URL);
  const db = drizzle(connection);

  const migrationsFolder = path.join(__dirname, "drizzle");
  await migrate(db, { migrationsFolder });

  console.log("Migrations completed successfully.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  if (connection) await connection.end();
}
