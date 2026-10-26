import "./env";
import { eq, sql } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { closeDb, withAudit, getDb } from "../src/db/client";
import { roles, userRoles, users } from "../src/db/schema";
import { checkPasswordPolicy, hashPassword } from "../src/server/auth/crypto";
import { syncAccessControl } from "../src/db/seed-core";

/**
 * Cria (ou promove) um administrador. Uso:
 *   pnpm user:create-admin                       (interativo)
 *   ADMIN_NAME=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. pnpm user:create-admin   (não interativo)
 * Nenhuma senha padrão existe no código.
 */
async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  const name = process.env.ADMIN_NAME || (await rl.question("Nome: "));
  const email = (process.env.ADMIN_EMAIL || (await rl.question("E-mail: "))).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (await rl.question("Senha (mín. 10, letras e números): "));
  rl.close();

  const policy = checkPasswordPolicy(password, email);
  if (policy) throw new Error(policy);
  const db = getDb();
  await syncAccessControl(db);
  const [adminRole] = await db.select().from(roles).where(eq(roles.key, "admin"));

  await withAudit({ userId: null, userAgent: "cli:create-admin" }, async (tx) => {
    const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    const id = existing
      ? existing.id
      : (await tx.insert(users).values({ name, email, passwordHash: await hashPassword(password) }).returning({ id: users.id }))[0].id;
    await tx.insert(userRoles).values({ userId: id, roleId: adminRole.id }).onConflictDoNothing();
    console.log(existing ? `Usuário existente ${email} promovido a Administrador.` : `Administrador ${email} criado.`);
  });
}
main()
  .catch((e) => {
    console.error("Erro:", e.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
