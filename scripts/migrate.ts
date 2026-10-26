import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../src/db/client";

async function main() {
  console.log("Aplicando migrações em", process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@"));
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("Migrações aplicadas.");
}
main()
  .catch((e) => {
    console.error("Falha ao migrar:", e);
    process.exitCode = 1;
  })
  .finally(closeDb);
