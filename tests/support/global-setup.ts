import { config } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../../src/db/schema";
import { seedDefaults } from "../../src/db/seed-core";

/** Recria do zero o banco de TESTES e aplica as migrações reais. */
export default async function setup() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL não definida");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("Por segurança, o nome do banco de testes deve conter 'test'");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDefaults(db as never);
  await client.end();
}
